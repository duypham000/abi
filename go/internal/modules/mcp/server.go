package mcp

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"

	"tomo-backend/internal/modules/docs/service"

	"gorm.io/gorm"
)

type ToolHandler func(ctx context.Context, userID string, args json.RawMessage) (*CallToolResult, error)

type Server struct {
	db            *gorm.DB
	docsService   service.DocsService
	canvasService service.CanvasService
	yjsService    service.YjsService
	tools         []Tool
	toolHandlers  map[string]ToolHandler
}

func NewServer(
	db *gorm.DB,
	docsService service.DocsService,
	canvasService service.CanvasService,
	yjsService service.YjsService,
) *Server {
	s := &Server{
		db:            db,
		docsService:   docsService,
		canvasService: canvasService,
		yjsService:    yjsService,
		toolHandlers:  make(map[string]ToolHandler),
	}
	s.registerDocsTools()
	s.registerCanvasTools()
	return s
}

func (s *Server) registerTool(tool Tool, handler ToolHandler) {
	s.tools = append(s.tools, tool)
	s.toolHandlers[tool.Name] = handler
}

func (s *Server) Tools() []Tool {
	out := make([]Tool, len(s.tools))
	copy(out, s.tools)
	return out
}

// HandleMessage processes a single JSON-RPC 2.0 request, notification, or batch.
// When isNotification is true, no response body should be sent (HTTP 202 Accepted).
func (s *Server) HandleMessage(ctx context.Context, userID string, raw []byte) (respBytes []byte, isNotification bool, err error) {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 {
		resp := JSONRPCResponse{
			JSONRPC: JSONRPCVersion,
			ID:      json.RawMessage("null"),
			Error:   &RPCError{Code: ErrCodeInvalidRequest, Message: "Empty request body"},
		}
		b, _ := json.Marshal(resp)
		return b, false, nil
	}

	if trimmed[0] == '[' {
		var reqs []json.RawMessage
		if err := json.Unmarshal(trimmed, &reqs); err != nil || len(reqs) == 0 {
			resp := JSONRPCResponse{
				JSONRPC: JSONRPCVersion,
				ID:      json.RawMessage("null"),
				Error:   &RPCError{Code: ErrCodeInvalidRequest, Message: "Invalid JSON-RPC batch"},
			}
			b, _ := json.Marshal(resp)
			return b, false, nil
		}
		var responses []JSONRPCResponse
		for _, item := range reqs {
			r, notif := s.handleSingleRaw(ctx, userID, item)
			if !notif && r != nil {
				responses = append(responses, *r)
			}
		}
		if len(responses) == 0 {
			return nil, true, nil
		}
		b, err := json.Marshal(responses)
		return b, false, err
	}

	r, notif := s.handleSingleRaw(ctx, userID, trimmed)
	if notif || r == nil {
		return nil, true, nil
	}
	b, err := json.Marshal(r)
	return b, false, err
}

func (s *Server) handleSingleRaw(ctx context.Context, userID string, raw []byte) (*JSONRPCResponse, bool) {
	var req JSONRPCRequest
	if err := json.Unmarshal(raw, &req); err != nil {
		return &JSONRPCResponse{
			JSONRPC: JSONRPCVersion,
			ID:      json.RawMessage("null"),
			Error:   &RPCError{Code: ErrCodeParseError, Message: "Parse error: " + err.Error()},
		}, false
	}

	isNotification := len(bytes.TrimSpace(req.ID)) == 0
	if req.JSONRPC != "" && req.JSONRPC != JSONRPCVersion {
		if isNotification {
			return nil, true
		}
		return &JSONRPCResponse{
			JSONRPC: JSONRPCVersion,
			ID:      req.ID,
			Error:   &RPCError{Code: ErrCodeInvalidRequest, Message: "Unsupported jsonrpc version"},
		}, false
	}
	if req.Method == "" {
		if isNotification {
			return nil, true
		}
		return &JSONRPCResponse{
			JSONRPC: JSONRPCVersion,
			ID:      req.ID,
			Error:   &RPCError{Code: ErrCodeInvalidRequest, Message: "Missing method"},
		}, false
	}

	// Notifications do not expect a JSON-RPC response.
	if isNotification || req.Method == "notifications/initialized" || req.Method == "notifications/cancelled" {
		return nil, true
	}

	result, rpcErr := s.dispatch(ctx, userID, req.Method, req.Params)
	if rpcErr != nil {
		return &JSONRPCResponse{
			JSONRPC: JSONRPCVersion,
			ID:      req.ID,
			Error:   rpcErr,
		}, false
	}
	return &JSONRPCResponse{
		JSONRPC: JSONRPCVersion,
		ID:      req.ID,
		Result:  result,
	}, false
}

func (s *Server) dispatch(ctx context.Context, userID, method string, params json.RawMessage) (interface{}, *RPCError) {
	switch method {
	case "initialize":
		var p InitializeParams
		if len(params) > 0 {
			_ = json.Unmarshal(params, &p)
		}
		proto := DefaultProtocolVersion
		if p.ProtocolVersion == LegacyProtocolVersion {
			proto = LegacyProtocolVersion
		}
		return InitializeResult{
			ProtocolVersion: proto,
			Capabilities: ServerCapabilities{
				Tools:     &ToolsCapability{ListChanged: false},
				Resources: &ResourcesCapability{Subscribe: false, ListChanged: false},
				Prompts:   &PromptsCapability{ListChanged: false},
			},
			ServerInfo: Implementation{
				Name:    "tomo-go-mcp",
				Version: "1.0.0",
			},
			Instructions: "Tomo backend MCP server for Docs, Series, Canvases, and Yjs tokens. Use docs_* tools for documents and revisions, series_* for document collections, canvas_* for Excalidraw whiteboards and diagram elements, and yjs_mint_token when connecting to realtime Yjs collaboration.",
		}, nil

	case "ping":
		return map[string]interface{}{}, nil

	case "tools/list":
		return ListToolsResult{Tools: s.Tools()}, nil

	case "tools/call":
		var p CallToolParams
		if err := json.Unmarshal(params, &p); err != nil || p.Name == "" {
			return nil, &RPCError{Code: ErrCodeInvalidParams, Message: "Invalid tools/call params"}
		}
		handler, ok := s.toolHandlers[p.Name]
		if !ok {
			return nil, &RPCError{Code: ErrCodeInvalidParams, Message: fmt.Sprintf("Unknown tool: %s", p.Name)}
		}
		res, err := handler(ctx, userID, p.Arguments)
		if err != nil {
			return textResult(err.Error(), true), nil
		}
		return res, nil

	case "resources/list":
		res, err := s.listResources(ctx, userID)
		if err != nil {
			return nil, &RPCError{Code: ErrCodeInternalError, Message: err.Error()}
		}
		return res, nil

	case "resources/templates/list":
		return s.listResourceTemplates(), nil

	case "resources/read":
		var p ReadResourceParams
		if err := json.Unmarshal(params, &p); err != nil || p.URI == "" {
			return nil, &RPCError{Code: ErrCodeInvalidParams, Message: "Missing resource URI"}
		}
		res, err := s.readResource(ctx, p.URI)
		if err != nil {
			return nil, &RPCError{Code: ErrCodeInvalidParams, Message: err.Error()}
		}
		return res, nil

	case "prompts/list":
		return s.listPrompts(), nil

	case "prompts/get":
		var p GetPromptParams
		if err := json.Unmarshal(params, &p); err != nil || p.Name == "" {
			return nil, &RPCError{Code: ErrCodeInvalidParams, Message: "Missing prompt name"}
		}
		res, err := s.getPrompt(p.Name, p.Arguments)
		if err != nil {
			return nil, &RPCError{Code: ErrCodeInvalidParams, Message: err.Error()}
		}
		return res, nil

	default:
		return nil, &RPCError{Code: ErrCodeMethodNotFound, Message: fmt.Sprintf("Method not found: %s", method)}
	}
}
