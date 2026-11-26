package dto

import "encoding/json"

// WorkspaceContextItem represents a pinned doc, canvas, file, or git diff from mini-editor.
type WorkspaceContextItem struct {
	ID       string      `json:"id"`
	Kind     string      `json:"kind"`
	Title    string      `json:"title"`
	Path     string      `json:"path,omitempty"`
	Subtitle string      `json:"subtitle,omitempty"`
	Excerpt  string      `json:"excerpt,omitempty"`
	Language string      `json:"language,omitempty"`
	SourceID interface{} `json:"sourceId,omitempty"`
}

// UIMessagePart represents one part in an AI SDK v6 UIMessage.
type UIMessagePart struct {
	Type      string `json:"type"`
	Text      string `json:"text,omitempty"`
	URL       string `json:"url,omitempty"`
	MediaType string `json:"mediaType,omitempty"`
	Filename  string `json:"filename,omitempty"`
}

// UIMessage represents an incoming chat message from AI SDK v6 DefaultChatTransport.
type UIMessage struct {
	ID    string          `json:"id"`
	Role  string          `json:"role"`
	Parts []UIMessagePart `json:"parts"`
}

// ClientAgentConfig carries runtime preferences selected in the mini-editor Agent panel.
type ClientAgentConfig struct {
	ModelID            string          `json:"modelId,omitempty"`
	Mode               string          `json:"mode,omitempty"`
	ReasoningEffort    string          `json:"reasoningEffort,omitempty"`
	HarnessID          string          `json:"harnessId,omitempty"`
	SystemPromptID     string          `json:"systemPromptId,omitempty"`
	SystemPromptAppend string          `json:"systemPromptAppend,omitempty"`
	ReplaceDefaultRule bool            `json:"replaceDefaultRule,omitempty"`
	ApprovalPolicy     string          `json:"approvalPolicy,omitempty"`
	ToolPermissions    map[string]bool `json:"toolPermissions,omitempty"`
}

// ChatRequest is the JSON body sent by HttpAgentTransport (AI SDK v6 DefaultChatTransport) to POST /agent/chat.
type ChatRequest struct {
	ID              string                 `json:"id"`
	ConversationID  string                 `json:"conversationId,omitempty"`
	SessionID       string                 `json:"sessionId,omitempty"`
	Messages        []UIMessage            `json:"messages"`
	Trigger         string                 `json:"trigger,omitempty"`
	MessageID       string                 `json:"messageId,omitempty"`
	ContextItems    []WorkspaceContextItem `json:"contextItems,omitempty"`
	AgentConfig     *ClientAgentConfig     `json:"agentConfig,omitempty"`
	HarnessID       string                 `json:"harnessId,omitempty"`
	RequestMetadata map[string]interface{} `json:"requestMetadata,omitempty"`
}

// PermissionDecisionRequest is sent to POST /agent/permissions/:id.
type PermissionDecisionRequest struct {
	Decision string `json:"decision" binding:"required"`
	Actor    string `json:"actor,omitempty"`
}

// GemOpsSessionConfig mirrors gemops session.SessionConfig.
type GemOpsSessionConfig struct {
	Model              string   `json:"model,omitempty"`
	Effort             string   `json:"effort,omitempty"`
	Mode               string   `json:"mode,omitempty"`
	SystemPromptID     string   `json:"systemPromptId,omitempty"`
	SystemPromptAppend string   `json:"systemPromptAppend,omitempty"`
	ReplaceDefaultRule bool     `json:"replaceDefaultRule,omitempty"`
	AdditionalDirs     []string `json:"additionalDirs,omitempty"`
	RestartIfNeeded    *bool    `json:"restartIfNeeded,omitempty"`
}

// GemOpsPromptRequest is sent to gemops POST /prompt.
type GemOpsPromptRequest struct {
	Prompt         string               `json:"prompt"`
	HarnessID      string               `json:"harnessId,omitempty"`
	ConversationID string               `json:"conversationId,omitempty"`
	SessionID      string               `json:"sessionId,omitempty"`
	SessionConfig  *GemOpsSessionConfig `json:"sessionConfig,omitempty"`
}

// GemOpsSavePromptRequest is sent to gemops POST /agy/prompts.
type GemOpsSavePromptRequest struct {
	ID      string `json:"id"`
	Content string `json:"content"`
}

// GemOpsCustomCommandRequest is sent to gemops POST /agy/command.
type GemOpsCustomCommandRequest struct {
	Mode       string   `json:"mode,omitempty"`
	Command    string   `json:"command"`
	Args       []string `json:"args,omitempty"`
	HarnessID  string   `json:"harnessId,omitempty"`
	TimeoutSec int      `json:"timeoutSec,omitempty"`
}

// GemOpsUpdateRequest is sent to gemops POST /update.
type GemOpsUpdateRequest struct {
	Branch     string `json:"branch,omitempty"`
	Restart    *bool  `json:"restart,omitempty"`
	RebuildWeb *bool  `json:"rebuildWeb,omitempty"`
}

// GemOpsCloneHarnessRequest is sent to gemops POST /harnesses/{id}/clone.
type GemOpsCloneHarnessRequest struct {
	TargetID string `json:"targetId"`
	Name     string `json:"name,omitempty"`
}

// GemOpsSaveSkillRequest is sent to gemops PUT /harnesses/{id}/skills/{name}.
type GemOpsSaveSkillRequest struct {
	Content string `json:"content"`
}

// GemOpsSetSecretRequest is sent to gemops PUT/POST /secrets.
type GemOpsSetSecretRequest struct {
	Scope       string `json:"scope"`
	Key         string `json:"key"`
	Value       string `json:"value"`
	Description string `json:"description,omitempty"`
}

// GemOpsPromptResponse is returned by gemops POST /prompt (202 Accepted).
type GemOpsPromptResponse struct {
	Status         string `json:"status"`
	TurnID         string `json:"turnId"`
	HarnessID      string `json:"harnessId"`
	ConversationID string `json:"conversationId,omitempty"`
}

// GemOpsPendingApproval mirrors gemops session.PendingApproval.
type GemOpsPendingApproval struct {
	ID         string   `json:"id"`
	HarnessID  string   `json:"harnessId,omitempty"`
	SessionID  string   `json:"sessionId"`
	ToolCallID string   `json:"toolCallId"`
	Kind       string   `json:"kind"`
	Name       string   `json:"name"`
	Title      string   `json:"title"`
	Command    string   `json:"command,omitempty"`
	Paths      []string `json:"paths,omitempty"`
	CreatedAt  string   `json:"createdAt"`
	ExpiresAt  string   `json:"expiresAt"`
}

// GemOpsSessionInfo mirrors one warm conversation entry from gemops GET /status or GET /sessions.
type GemOpsSessionInfo struct {
	Key             string               `json:"key,omitempty"`
	ConversationID  string               `json:"conversationId"`
	ACPSessionID    string               `json:"acpSessionId,omitempty"`
	HarnessID       string               `json:"harnessId,omitempty"`
	HarnessRevision string               `json:"harnessRevision,omitempty"`
	SessionID       string               `json:"sessionId,omitempty"`
	TurnCount       int                  `json:"turnCount"`
	Turns           int                  `json:"turns,omitempty"`
	SessionConfig   *GemOpsSessionConfig `json:"sessionConfig,omitempty"`
	EstimatedChars  int                  `json:"estimatedChars,omitempty"`
	CreatedAt       string               `json:"createdAt,omitempty"`
	UpdatedAt       string               `json:"updatedAt,omitempty"`
	LastUsedAt      string               `json:"lastUsedAt,omitempty"`
	NeedsNewSession bool                 `json:"needsNewSession,omitempty"`
}

// GemOpsStatusResponse mirrors gemops GET /status.
type GemOpsStatusResponse struct {
	InstanceID           string                  `json:"instanceId,omitempty"`
	State                string                  `json:"state"`
	StateSeq             uint64                  `json:"stateSeq"`
	DefaultHarnessID     string                  `json:"defaultHarnessId"`
	ActiveHarnessID      string                  `json:"activeHarnessId"`
	ActiveHarnessName    string                  `json:"activeHarnessName,omitempty"`
	ActiveHarnessRev     string                  `json:"activeHarnessRevision,omitempty"`
	ActivePolicyProfile  string                  `json:"activePolicyProfile,omitempty"`
	ActiveConversationID string                  `json:"activeConversationId,omitempty"`
	SessionID            string                  `json:"sessionId,omitempty"`
	SessionsCount        int                     `json:"sessionsCount,omitempty"`
	Sessions             []GemOpsSessionInfo     `json:"sessions,omitempty"`
	ActiveTurnID         string                  `json:"activeTurnId,omitempty"`
	ActiveToolsCount     int                     `json:"activeToolsCount"`
	GeminiPID            int                     `json:"geminiPid"`
	GeminiRSSMB          int64                   `json:"geminiRssMB"`
	GoAllocMB            float64                 `json:"goAllocMB"`
	TurnCount            int                     `json:"turnCount"`
	IdleSeconds          int64                   `json:"idleSeconds"`
	HasSummary           bool                    `json:"hasSummary"`
	SummaryPreview       string                  `json:"summaryPreview,omitempty"`
	PendingApprovals     []GemOpsPendingApproval `json:"pendingApprovals"`
	SessionConfig        GemOpsSessionConfig     `json:"sessionConfig"`
	LastUsage            map[string]interface{}  `json:"lastUsage,omitempty"`
}

// GemOpsModelOption mirrors gemops agy.ModelOption.
type GemOpsModelOption struct {
	ID    string `json:"id"`
	Label string `json:"label"`
}

// GemOpsInfoResponse mirrors gemops GET /agy/info.
type GemOpsInfoResponse struct {
	Binary  string              `json:"binary"`
	Version string              `json:"version"`
	Models  []GemOpsModelOption `json:"models"`
	Efforts []string            `json:"efforts"`
	Modes   []string            `json:"modes"`
	Note    string              `json:"note,omitempty"`
}

// GemOpsHarnessSummary mirrors gemops harness.HarnessSummary.
type GemOpsHarnessSummary struct {
	ID              string   `json:"id"`
	Name            string   `json:"name"`
	Description     string   `json:"description,omitempty"`
	IsCommon        bool     `json:"isCommon"`
	Enabled         bool     `json:"enabled"`
	IsActive        bool     `json:"isActive,omitempty"`
	Tags            []string `json:"tags,omitempty"`
	InheritanceMode string   `json:"inheritanceMode"`
	PolicyProfile   string   `json:"policyProfile"`
	Revision        string   `json:"revision"`
	UpdatedAt       string   `json:"updatedAt,omitempty"`
	RuleCount       int      `json:"ruleCount"`
	MCPCount        int      `json:"mcpCount"`
	HookCount       int      `json:"hookCount"`
}

// GemOpsHarnessesResponse mirrors gemops GET /harnesses.
type GemOpsHarnessesResponse struct {
	DefaultHarnessID string                 `json:"defaultHarnessId"`
	ActiveHarnessID  string                 `json:"activeHarnessId"`
	HarnessesDir     string                 `json:"harnessesDir,omitempty"`
	Items            []GemOpsHarnessSummary `json:"items"`
}

// GemOpsEvent represents one SSE event emitted by gemops GET /events.
type GemOpsEvent struct {
	ID        string          `json:"id"`
	Type      string          `json:"type"`
	Timestamp string          `json:"ts"`
	Data      json.RawMessage `json:"data"`
}

// GemOpsTransportInfo describes the resolved upstream transport link to gemops-agent.
type GemOpsTransportInfo struct {
	Mode       string `json:"mode"` // "unix" or "tcp"
	Target     string `json:"target"`
	SocketPath string `json:"socketPath,omitempty"`
	TCPURL     string `json:"tcpUrl,omitempty"`
}

// GemOpsHealthResponse mirrors gemops-web GET /api/healthz diagnostics.
type GemOpsHealthResponse struct {
	Status         string              `json:"status"`
	Service        string              `json:"service"`
	Timestamp      string              `json:"timestamp"`
	Transport      GemOpsTransportInfo `json:"transport"`
	AgentReachable bool                `json:"agentReachable"`
	AgentStatus    int                 `json:"agentStatus,omitempty"`
	AgentError     string              `json:"agentError,omitempty"`
}
