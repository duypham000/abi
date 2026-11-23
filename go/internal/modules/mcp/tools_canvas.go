package mcp

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math/rand"
	"strings"
	"time"

	"tomo-backend/internal/modules/docs/domain"
	"tomo-backend/internal/modules/docs/dto"
	"tomo-backend/internal/modules/docs/service"

	"github.com/google/uuid"
)

type canvasScenePayload struct {
	Elements []map[string]interface{} `json:"elements"`
	AppState map[string]interface{}   `json:"appState"`
	Files    map[string]interface{}   `json:"files"`
}

func parseCanvasScene(raw string) canvasScenePayload {
	out := canvasScenePayload{
		Elements: []map[string]interface{}{},
		AppState: map[string]interface{}{},
		Files:    map[string]interface{}{},
	}
	if strings.TrimSpace(raw) == "" {
		return out
	}
	_ = json.Unmarshal([]byte(raw), &out)
	if out.Elements == nil {
		out.Elements = []map[string]interface{}{}
	}
	if out.AppState == nil {
		out.AppState = map[string]interface{}{}
	}
	if out.Files == nil {
		out.Files = map[string]interface{}{}
	}
	return out
}

func nextSeed() int32 {
	return rand.Int31n(2_000_000_000) + 1
}

func normalizeExcalidrawElement(input map[string]interface{}) (map[string]interface{}, *map[string]interface{}) {
	el := make(map[string]interface{}, len(input)+20)
	for k, v := range input {
		el[k] = v
	}

	labelVal, hasLabel := el["label"]
	delete(el, "label")

	if _, ok := el["id"]; !ok || fmt.Sprint(el["id"]) == "" {
		el["id"] = uuid.New().String()[:12]
	}
	elType, _ := el["type"].(string)
	if elType == "" {
		elType = "rectangle"
		el["type"] = elType
	}

	setDefault := func(key string, val interface{}) {
		if _, ok := el[key]; !ok {
			el[key] = val
		}
	}

	setDefault("x", 0.0)
	setDefault("y", 0.0)
	switch elType {
	case "arrow", "line":
		setDefault("width", 120.0)
		setDefault("height", 0.0)
	default:
		setDefault("width", 180.0)
		setDefault("height", 80.0)
	}
	setDefault("angle", 0.0)
	setDefault("strokeColor", "#1e1e1e")
	setDefault("backgroundColor", "transparent")
	setDefault("fillStyle", "solid")
	setDefault("strokeWidth", 2)
	setDefault("strokeStyle", "solid")
	setDefault("roughness", 1)
	setDefault("opacity", 100)
	setDefault("groupIds", []interface{}{})
	setDefault("frameId", nil)
	setDefault("seed", nextSeed())
	setDefault("version", 1)
	setDefault("versionNonce", nextSeed())
	setDefault("isDeleted", false)
	setDefault("boundElements", []interface{}{})
	setDefault("updated", time.Now().UnixMilli())
	setDefault("link", nil)
	setDefault("locked", false)

	switch elType {
	case "rectangle", "diamond":
		setDefault("roundness", map[string]interface{}{"type": 3})
	case "ellipse":
		setDefault("roundness", map[string]interface{}{"type": 2})
	case "arrow", "line":
		setDefault("roundness", map[string]interface{}{"type": 2})
		if _, ok := el["points"]; !ok {
			w := toFloat(el["width"], 120)
			h := toFloat(el["height"], 0)
			el["points"] = [][]float64{{0, 0}, {w, h}}
		}
		if elType == "arrow" {
			setDefault("startBinding", nil)
			setDefault("endBinding", nil)
			setDefault("startArrowhead", nil)
			setDefault("endArrowhead", "arrow")
		}
	case "text":
		txt, _ := el["text"].(string)
		setDefault("text", txt)
		setDefault("fontSize", 20)
		setDefault("fontFamily", 1)
		setDefault("textAlign", "left")
		setDefault("verticalAlign", "top")
		setDefault("baseline", 18)
		setDefault("containerId", nil)
		setDefault("originalText", txt)
		setDefault("autoResize", true)
		setDefault("lineHeight", 1.25)
		setDefault("roundness", nil)
	}

	var boundText *map[string]interface{}
	if hasLabel && elType != "text" {
		if labelStr, ok := labelVal.(string); ok && strings.TrimSpace(labelStr) != "" {
			textID := uuid.New().String()[:12]
			x := toFloat(el["x"], 0)
			y := toFloat(el["y"], 0)
			w := toFloat(el["width"], 180)
			h := toFloat(el["height"], 80)
			textW := w - 20
			if textW < 40 {
				textW = 80
			}
			textH := 25.0
			tb := map[string]interface{}{
				"id":              textID,
				"type":            "text",
				"x":               x + (w-textW)/2,
				"y":               y + (h-textH)/2,
				"width":           textW,
				"height":          textH,
				"angle":           0.0,
				"strokeColor":     el["strokeColor"],
				"backgroundColor": "transparent",
				"fillStyle":       "solid",
				"strokeWidth":     1,
				"strokeStyle":     "solid",
				"roughness":       1,
				"opacity":         100,
				"groupIds":        []interface{}{},
				"frameId":         nil,
				"roundness":       nil,
				"seed":            nextSeed(),
				"version":         1,
				"versionNonce":    nextSeed(),
				"isDeleted":       false,
				"boundElements":   nil,
				"updated":         time.Now().UnixMilli(),
				"link":            nil,
				"locked":          false,
				"text":            labelStr,
				"fontSize":        18,
				"fontFamily":      1,
				"textAlign":       "center",
				"verticalAlign":   "middle",
				"baseline":        16,
				"containerId":     el["id"],
				"originalText":    labelStr,
				"autoResize":      true,
				"lineHeight":      1.25,
			}
			boundText = &tb

			var boundList []interface{}
			if existing, ok := el["boundElements"].([]interface{}); ok {
				boundList = append(boundList, existing...)
			}
			boundList = append(boundList, map[string]interface{}{
				"id":   textID,
				"type": "text",
			})
			el["boundElements"] = boundList
		}
	}

	return el, boundText
}

func toFloat(v interface{}, fallback float64) float64 {
	switch n := v.(type) {
	case float64:
		return n
	case float32:
		return float64(n)
	case int:
		return float64(n)
	case int64:
		return float64(n)
	default:
		return fallback
	}
}

func toInt(v interface{}, fallback int) int {
	switch n := v.(type) {
	case float64:
		return int(n)
	case float32:
		return int(n)
	case int:
		return n
	case int64:
		return int(n)
	default:
		return fallback
	}
}

func (s *Server) registerCanvasTools() {
	s.registerTool(Tool{
		Name:        "canvas_list",
		Description: "List Excalidraw canvases owned by the user with pagination and optional keyword search.",
		InputSchema: map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"page":      map[string]interface{}{"type": "integer", "description": "1-based page number (default 1)"},
				"page_size": map[string]interface{}{"type": "integer", "description": "Items per page (default 20)"},
				"search":    map[string]interface{}{"type": "string", "description": "Search keyword matching canvas title or metadata"},
			},
		},
		Annotations: &ToolAnnotations{Title: "List Canvases", ReadOnlyHint: boolPtr(true)},
	}, s.handleCanvasList)

	s.registerTool(Tool{
		Name:        "canvas_get",
		Description: "Get a canvas by ID or slug, including parsed scene elements, appState, files, and metadata.",
		InputSchema: map[string]interface{}{
			"type":     "object",
			"required": []string{"id"},
			"properties": map[string]interface{}{
				"id": map[string]interface{}{"type": "string", "description": "Canvas ID, canvas-<id>, or slug"},
			},
		},
		Annotations: &ToolAnnotations{Title: "Get Canvas", ReadOnlyHint: boolPtr(true)},
	}, s.handleCanvasGet)

	s.registerTool(Tool{
		Name:        "canvas_create",
		Description: "Create a new Excalidraw canvas, optionally seeded with initial elements (with automatic defaults & label support).",
		InputSchema: map[string]interface{}{
			"type":     "object",
			"required": []string{"title"},
			"properties": map[string]interface{}{
				"title":     map[string]interface{}{"type": "string", "description": "Canvas title"},
				"elements":  map[string]interface{}{"type": "array", "items": map[string]interface{}{"type": "object"}, "description": "Optional initial Excalidraw elements (supports a `label` field on shapes)"},
				"app_state": map[string]interface{}{"type": "object", "description": "Optional Excalidraw appState"},
				"tags":      map[string]interface{}{"type": "array", "items": map[string]interface{}{"type": "string"}},
				"starred":   map[string]interface{}{"type": "boolean"},
				"status":    map[string]interface{}{"type": "integer", "description": "0=draft, 1=active (default 1)"},
			},
		},
		Annotations: &ToolAnnotations{Title: "Create Canvas", DestructiveHint: boolPtr(false)},
	}, s.handleCanvasCreate)

	s.registerTool(Tool{
		Name:        "canvas_update",
		Description: "Update canvas title, full scene JSON, metadata JSON, or status.",
		InputSchema: map[string]interface{}{
			"type":     "object",
			"required": []string{"id"},
			"properties": map[string]interface{}{
				"id":       map[string]interface{}{"type": "string", "description": "Canvas ID"},
				"title":    map[string]interface{}{"type": "string"},
				"scene":    map[string]interface{}{"description": "Excalidraw scene object or JSON string"},
				"metadata": map[string]interface{}{"description": "Canvas metadata object or JSON string"},
				"status":   map[string]interface{}{"type": "integer"},
			},
		},
		Annotations: &ToolAnnotations{Title: "Update Canvas", DestructiveHint: boolPtr(false)},
	}, s.handleCanvasUpdate)

	s.registerTool(Tool{
		Name:        "canvas_add_elements",
		Description: "Add one or more Excalidraw elements (rectangle, ellipse, diamond, text, arrow, line) to a canvas. Auto-fills valid Excalidraw fields and converts a shape's `label` into a bound centered text element.",
		InputSchema: map[string]interface{}{
			"type":     "object",
			"required": []string{"id", "elements"},
			"properties": map[string]interface{}{
				"id":       map[string]interface{}{"type": "string", "description": "Canvas ID"},
				"elements": map[string]interface{}{"type": "array", "items": map[string]interface{}{"type": "object"}, "description": "Array of Excalidraw element objects"},
			},
		},
		Annotations: &ToolAnnotations{Title: "Add Canvas Elements", DestructiveHint: boolPtr(false)},
	}, s.handleCanvasAddElements)

	s.registerTool(Tool{
		Name:        "canvas_update_elements",
		Description: "Update existing elements in a canvas by element ID (merges provided fields and bumps version/versionNonce).",
		InputSchema: map[string]interface{}{
			"type":     "object",
			"required": []string{"id", "updates"},
			"properties": map[string]interface{}{
				"id":      map[string]interface{}{"type": "string", "description": "Canvas ID"},
				"updates": map[string]interface{}{"type": "array", "items": map[string]interface{}{"type": "object"}, "description": "Objects each containing `id` and fields to update"},
			},
		},
		Annotations: &ToolAnnotations{Title: "Update Canvas Elements", DestructiveHint: boolPtr(false)},
	}, s.handleCanvasUpdateElements)

	s.registerTool(Tool{
		Name:        "canvas_delete_elements",
		Description: "Delete elements from a canvas by element IDs (soft-deletes with isDeleted=true by default, or hard removes if hard_delete=true).",
		InputSchema: map[string]interface{}{
			"type":     "object",
			"required": []string{"id", "element_ids"},
			"properties": map[string]interface{}{
				"id":          map[string]interface{}{"type": "string", "description": "Canvas ID"},
				"element_ids": map[string]interface{}{"type": "array", "items": map[string]interface{}{"type": "string"}},
				"hard_delete": map[string]interface{}{"type": "boolean", "description": "Remove elements completely from array instead of marking isDeleted=true"},
			},
		},
		Annotations: &ToolAnnotations{Title: "Delete Canvas Elements", DestructiveHint: boolPtr(true)},
	}, s.handleCanvasDeleteElements)

	s.registerTool(Tool{
		Name:        "canvas_delete",
		Description: "Permanently delete a canvas by ID.",
		InputSchema: map[string]interface{}{
			"type":     "object",
			"required": []string{"id"},
			"properties": map[string]interface{}{
				"id": map[string]interface{}{"type": "string", "description": "Canvas ID"},
			},
		},
		Annotations: &ToolAnnotations{Title: "Delete Canvas", DestructiveHint: boolPtr(true)},
	}, s.handleCanvasDelete)

	s.registerTool(Tool{
		Name:        "yjs_mint_token",
		Description: "Mint a short-lived Yjs WebSocket collaboration JWT and return the WS URL for a doc or canvas room.",
		InputSchema: map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"doc_id":      map[string]interface{}{"type": "string", "description": "Document ID"},
				"canvas_id":   map[string]interface{}{"type": "string", "description": "Canvas ID (without canvas- prefix)"},
				"access_mode": map[string]interface{}{"type": "string", "enum": []string{"read", "write"}},
			},
		},
		Annotations: &ToolAnnotations{Title: "Mint Yjs Token", ReadOnlyHint: boolPtr(true)},
	}, s.handleYjsMintToken)
}

func (s *Server) handleCanvasList(ctx context.Context, userID string, raw json.RawMessage) (*CallToolResult, error) {
	var args struct {
		Page     int    `json:"page"`
		PageSize int    `json:"page_size"`
		Search   string `json:"search"`
	}
	if err := decodeArgs(raw, &args); err != nil {
		return textResult("invalid arguments: "+err.Error(), true), nil
	}
	if args.Page <= 0 {
		args.Page = 1
	}
	if args.PageSize <= 0 {
		args.PageSize = 20
	}
	res, err := s.canvasService.ListCanvases(ctx, userID, args.Page, args.PageSize, args.Search)
	if err != nil {
		return textResult("failed to list canvases: "+err.Error(), true), nil
	}
	return jsonResult(res)
}

func (s *Server) handleCanvasGet(ctx context.Context, _ string, raw json.RawMessage) (*CallToolResult, error) {
	var args struct {
		ID string `json:"id"`
	}
	if err := decodeArgs(raw, &args); err != nil {
		return textResult("invalid arguments: "+err.Error(), true), nil
	}
	if args.ID == "" {
		return textResult("id is required", true), nil
	}
	c, err := s.canvasService.GetCanvasByID(ctx, args.ID)
	if err != nil {
		return textResult(err.Error(), true), nil
	}
	parsedScene := parseCanvasScene(c.Scene)
	activeCount := 0
	for _, el := range parsedScene.Elements {
		if del, _ := el["isDeleted"].(bool); !del {
			activeCount++
		}
	}
	return jsonResult(map[string]interface{}{
		"canvas":               c,
		"parsed_scene":         parsedScene,
		"active_element_count": activeCount,
		"total_element_count":  len(parsedScene.Elements),
	})
}

func (s *Server) handleCanvasCreate(ctx context.Context, userID string, raw json.RawMessage) (*CallToolResult, error) {
	var args struct {
		Title    string                   `json:"title"`
		Elements []map[string]interface{} `json:"elements"`
		AppState map[string]interface{}   `json:"app_state"`
		Tags     []string                 `json:"tags"`
		Starred  bool                     `json:"starred"`
		Status   *int                     `json:"status"`
	}
	if err := decodeArgs(raw, &args); err != nil {
		return textResult("invalid arguments: "+err.Error(), true), nil
	}
	if strings.TrimSpace(args.Title) == "" {
		return textResult("title is required", true), nil
	}

	normalized := make([]map[string]interface{}, 0, len(args.Elements))
	for _, rawEl := range args.Elements {
		el, boundText := normalizeExcalidrawElement(rawEl)
		normalized = append(normalized, el)
		if boundText != nil {
			normalized = append(normalized, *boundText)
		}
	}
	appState := args.AppState
	if appState == nil {
		appState = map[string]interface{}{}
	}
	sceneBytes, _ := json.Marshal(canvasScenePayload{
		Elements: normalized,
		AppState: appState,
		Files:    map[string]interface{}{},
	})

	tags := args.Tags
	if tags == nil {
		tags = []string{}
	}
	metaBytes, _ := json.Marshal(map[string]interface{}{
		"starred":   args.Starred,
		"tags":      tags,
		"thumbnail": nil,
	})

	created, err := s.canvasService.CreateCanvas(ctx, userID, dto.CreateCanvasRequest{
		Title:    args.Title,
		Scene:    string(sceneBytes),
		Metadata: string(metaBytes),
		Status:   args.Status,
	})
	if err != nil {
		return textResult("failed to create canvas: "+err.Error(), true), nil
	}
	return jsonResult(created)
}

func (s *Server) handleCanvasUpdate(ctx context.Context, userID string, raw json.RawMessage) (*CallToolResult, error) {
	var args struct {
		ID       string          `json:"id"`
		Title    *string         `json:"title"`
		Scene    json.RawMessage `json:"scene"`
		Metadata json.RawMessage `json:"metadata"`
		Status   *int            `json:"status"`
	}
	if err := decodeArgs(raw, &args); err != nil {
		return textResult("invalid arguments: "+err.Error(), true), nil
	}
	if args.ID == "" {
		return textResult("id is required", true), nil
	}

	req := dto.UpdateCanvasRequest{
		Title:  args.Title,
		Status: args.Status,
	}
	if len(args.Scene) > 0 && string(args.Scene) != "null" {
		var asStr string
		if err := json.Unmarshal(args.Scene, &asStr); err == nil {
			req.Scene = &asStr
		} else {
			rawStr := string(args.Scene)
			req.Scene = &rawStr
		}
	}
	if len(args.Metadata) > 0 && string(args.Metadata) != "null" {
		var asStr string
		if err := json.Unmarshal(args.Metadata, &asStr); err == nil {
			req.Metadata = &asStr
		} else {
			rawStr := string(args.Metadata)
			req.Metadata = &rawStr
		}
	}

	updated, err := s.canvasService.UpdateCanvas(ctx, args.ID, userID, req)
	if err != nil {
		if errors.Is(err, service.ErrCanvasNotFound) {
			return textResult("canvas not found", true), nil
		}
		return textResult("failed to update canvas: "+err.Error(), true), nil
	}
	return jsonResult(updated)
}

func (s *Server) handleCanvasAddElements(ctx context.Context, userID string, raw json.RawMessage) (*CallToolResult, error) {
	var args struct {
		ID       string                   `json:"id"`
		Elements []map[string]interface{} `json:"elements"`
	}
	if err := decodeArgs(raw, &args); err != nil {
		return textResult("invalid arguments: "+err.Error(), true), nil
	}
	if args.ID == "" || len(args.Elements) == 0 {
		return textResult("id and non-empty elements are required", true), nil
	}

	c, err := s.canvasService.GetCanvasByID(ctx, args.ID)
	if err != nil {
		return textResult(err.Error(), true), nil
	}
	scene := parseCanvasScene(c.Scene)
	addedIDs := make([]string, 0, len(args.Elements))

	for _, rawEl := range args.Elements {
		el, boundText := normalizeExcalidrawElement(rawEl)
		scene.Elements = append(scene.Elements, el)
		addedIDs = append(addedIDs, fmt.Sprint(el["id"]))
		if boundText != nil {
			scene.Elements = append(scene.Elements, *boundText)
			addedIDs = append(addedIDs, fmt.Sprint((*boundText)["id"]))
		}
	}

	sceneBytes, _ := json.Marshal(scene)
	sceneStr := string(sceneBytes)
	updated, err := s.canvasService.UpdateCanvas(ctx, c.ID, userID, dto.UpdateCanvasRequest{
		Scene: &sceneStr,
	})
	if err != nil {
		return textResult("failed to add elements: "+err.Error(), true), nil
	}
	return jsonResult(map[string]interface{}{
		"canvas":          updated,
		"added_ids":       addedIDs,
		"total_elements":  len(scene.Elements),
	})
}

func (s *Server) handleCanvasUpdateElements(ctx context.Context, userID string, raw json.RawMessage) (*CallToolResult, error) {
	var args struct {
		ID      string                   `json:"id"`
		Updates []map[string]interface{} `json:"updates"`
	}
	if err := decodeArgs(raw, &args); err != nil {
		return textResult("invalid arguments: "+err.Error(), true), nil
	}
	if args.ID == "" || len(args.Updates) == 0 {
		return textResult("id and non-empty updates are required", true), nil
	}

	c, err := s.canvasService.GetCanvasByID(ctx, args.ID)
	if err != nil {
		return textResult(err.Error(), true), nil
	}
	scene := parseCanvasScene(c.Scene)

	byID := make(map[string]int, len(scene.Elements))
	for i, el := range scene.Elements {
		byID[fmt.Sprint(el["id"])] = i
	}

	var updatedIDs []string
	var missingIDs []string
	now := time.Now().UnixMilli()

	for _, patch := range args.Updates {
		elID := fmt.Sprint(patch["id"])
		if elID == "" || elID == "<nil>" {
			continue
		}
		idx, ok := byID[elID]
		if !ok {
			missingIDs = append(missingIDs, elID)
			continue
		}
		target := scene.Elements[idx]
		for k, v := range patch {
			if k == "id" {
				continue
			}
			target[k] = v
		}
		target["version"] = toInt(target["version"], 1) + 1
		target["versionNonce"] = nextSeed()
		target["updated"] = now
		scene.Elements[idx] = target
		updatedIDs = append(updatedIDs, elID)
	}

	sceneBytes, _ := json.Marshal(scene)
	sceneStr := string(sceneBytes)
	updated, err := s.canvasService.UpdateCanvas(ctx, c.ID, userID, dto.UpdateCanvasRequest{
		Scene: &sceneStr,
	})
	if err != nil {
		return textResult("failed to update elements: "+err.Error(), true), nil
	}
	return jsonResult(map[string]interface{}{
		"canvas":      updated,
		"updated_ids": updatedIDs,
		"missing_ids": missingIDs,
	})
}

func (s *Server) handleCanvasDeleteElements(ctx context.Context, userID string, raw json.RawMessage) (*CallToolResult, error) {
	var args struct {
		ID         string   `json:"id"`
		ElementIDs []string `json:"element_ids"`
		HardDelete bool     `json:"hard_delete"`
	}
	if err := decodeArgs(raw, &args); err != nil {
		return textResult("invalid arguments: "+err.Error(), true), nil
	}
	if args.ID == "" || len(args.ElementIDs) == 0 {
		return textResult("id and element_ids are required", true), nil
	}

	c, err := s.canvasService.GetCanvasByID(ctx, args.ID)
	if err != nil {
		return textResult(err.Error(), true), nil
	}
	scene := parseCanvasScene(c.Scene)

	targetSet := make(map[string]bool, len(args.ElementIDs))
	for _, eid := range args.ElementIDs {
		targetSet[eid] = true
	}

	now := time.Now().UnixMilli()
	deletedCount := 0
	if args.HardDelete {
		kept := make([]map[string]interface{}, 0, len(scene.Elements))
		for _, el := range scene.Elements {
			eid := fmt.Sprint(el["id"])
			if targetSet[eid] {
				deletedCount++
				continue
			}
			kept = append(kept, el)
		}
		scene.Elements = kept
	} else {
		for i, el := range scene.Elements {
			eid := fmt.Sprint(el["id"])
			if targetSet[eid] {
				el["isDeleted"] = true
				el["version"] = toInt(el["version"], 1) + 1
				el["versionNonce"] = nextSeed()
				el["updated"] = now
				scene.Elements[i] = el
				deletedCount++
			}
		}
	}

	sceneBytes, _ := json.Marshal(scene)
	sceneStr := string(sceneBytes)
	updated, err := s.canvasService.UpdateCanvas(ctx, c.ID, userID, dto.UpdateCanvasRequest{
		Scene: &sceneStr,
	})
	if err != nil {
		return textResult("failed to delete elements: "+err.Error(), true), nil
	}
	return jsonResult(map[string]interface{}{
		"canvas":        updated,
		"deleted_count": deletedCount,
		"hard_delete":   args.HardDelete,
	})
}

func (s *Server) handleCanvasDelete(ctx context.Context, userID string, raw json.RawMessage) (*CallToolResult, error) {
	var args struct {
		ID string `json:"id"`
	}
	if err := decodeArgs(raw, &args); err != nil {
		return textResult("invalid arguments: "+err.Error(), true), nil
	}
	if args.ID == "" {
		return textResult("id is required", true), nil
	}
	if err := s.canvasService.DeleteCanvas(ctx, args.ID, userID); err != nil {
		if errors.Is(err, service.ErrCanvasNotFound) {
			return textResult("canvas not found", true), nil
		}
		return textResult("failed to delete canvas: "+err.Error(), true), nil
	}
	return jsonResult(map[string]interface{}{"deleted": true, "id": args.ID})
}

func (s *Server) handleYjsMintToken(ctx context.Context, userID string, raw json.RawMessage) (*CallToolResult, error) {
	var args struct {
		DocID      string `json:"doc_id"`
		CanvasID   string `json:"canvas_id"`
		AccessMode string `json:"access_mode"`
	}
	if err := decodeArgs(raw, &args); err != nil {
		return textResult("invalid arguments: "+err.Error(), true), nil
	}
	if args.DocID == "" && args.CanvasID == "" {
		return textResult("either doc_id or canvas_id is required", true), nil
	}
	res, err := s.yjsService.GenerateYjsToken(ctx, userID, dto.YjsTokenRequest{
		DocID:      args.DocID,
		CanvasID:   args.CanvasID,
		AccessMode: domain.YjsAccessMode(args.AccessMode),
	})
	if err != nil {
		return textResult("failed to mint Yjs token: "+err.Error(), true), nil
	}
	return jsonResult(res)
}
