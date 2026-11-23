package mcp

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"tomo-backend/internal/modules/docs/domain"
	"tomo-backend/internal/modules/docs/dto"
	"tomo-backend/internal/modules/docs/service"
)

func decodeArgs(raw json.RawMessage, dst interface{}) error {
	if len(raw) == 0 {
		return nil
	}
	return json.Unmarshal(raw, dst)
}

func (s *Server) registerDocsTools() {
	s.registerTool(Tool{
		Name:        "docs_list",
		Description: "List documents owned by the authenticated user with optional pagination, parent folder filter, and keyword search.",
		InputSchema: map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"page":      map[string]interface{}{"type": "integer", "description": "1-based page number (default 1)"},
				"page_size": map[string]interface{}{"type": "integer", "description": "Items per page (default 20)"},
				"parent_id": map[string]interface{}{"type": "string", "description": "Optional parent doc ID; pass empty string \"\" for root docs only"},
				"search":    map[string]interface{}{"type": "string", "description": "Optional search keyword matching title or content"},
			},
		},
		Annotations: &ToolAnnotations{Title: "List Documents", ReadOnlyHint: boolPtr(true)},
	}, s.handleDocsList)

	s.registerTool(Tool{
		Name:        "docs_search",
		Description: "Search documents by keyword across title and content.",
		InputSchema: map[string]interface{}{
			"type":     "object",
			"required": []string{"query"},
			"properties": map[string]interface{}{
				"query":     map[string]interface{}{"type": "string", "description": "Search query string"},
				"page":      map[string]interface{}{"type": "integer", "description": "1-based page number (default 1)"},
				"page_size": map[string]interface{}{"type": "integer", "description": "Items per page (default 20)"},
			},
		},
		Annotations: &ToolAnnotations{Title: "Search Documents", ReadOnlyHint: boolPtr(true)},
	}, s.handleDocsSearch)

	s.registerTool(Tool{
		Name:        "docs_tree",
		Description: "Get the hierarchical document tree (folders and nested child documents) for the user.",
		InputSchema: map[string]interface{}{
			"type":       "object",
			"properties": map[string]interface{}{},
		},
		Annotations: &ToolAnnotations{Title: "Get Document Tree", ReadOnlyHint: boolPtr(true)},
	}, s.handleDocsTree)

	s.registerTool(Tool{
		Name:        "docs_get",
		Description: "Fetch a document by ID or slug with optional character-range pagination (offset, limit) or heading outline extraction (outline_only).",
		InputSchema: map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"id":           map[string]interface{}{"type": "string", "description": "Document UUID or ID"},
				"slug":         map[string]interface{}{"type": "string", "description": "Document unique slug (used if id is omitted)"},
				"offset":       map[string]interface{}{"type": "integer", "description": "0-based character (rune) offset for chunked reads (default 0)"},
				"limit":        map[string]interface{}{"type": "integer", "description": "Max characters to return (0 returns full if <= 32768 chars, else caps at 32768)"},
				"outline_only": map[string]interface{}{"type": "boolean", "description": "Extract Markdown headings with line and char offsets instead of returning content"},
			},
		},
		Annotations: &ToolAnnotations{Title: "Get Document", ReadOnlyHint: boolPtr(true)},
	}, s.handleDocsGet)

	s.registerTool(Tool{
		Name:        "docs_create",
		Description: "Create a new document with title, optional content, status (DRAFT|PUBLISHED|ARCHIVED), and optional parent_id.",
		InputSchema: map[string]interface{}{
			"type":     "object",
			"required": []string{"title"},
			"properties": map[string]interface{}{
				"title":     map[string]interface{}{"type": "string", "description": "Document title"},
				"content":   map[string]interface{}{"type": "string", "description": "Document content (Markdown, plain text, or BlockNote JSON)"},
				"status":    map[string]interface{}{"type": "string", "enum": []string{"DRAFT", "PUBLISHED", "ARCHIVED"}, "description": "Document status (default DRAFT)"},
				"parent_id": map[string]interface{}{"type": "string", "description": "Optional parent document ID"},
			},
		},
		Annotations: &ToolAnnotations{Title: "Create Document", DestructiveHint: boolPtr(false)},
	}, s.handleDocsCreate)

	s.registerTool(Tool{
		Name:        "docs_update",
		Description: "Update an existing document's title, content, status, parent_id, or pin/star flags.",
		InputSchema: map[string]interface{}{
			"type":     "object",
			"required": []string{"id"},
			"properties": map[string]interface{}{
				"id":         map[string]interface{}{"type": "string", "description": "Document ID"},
				"title":      map[string]interface{}{"type": "string"},
				"content":    map[string]interface{}{"type": "string"},
				"status":     map[string]interface{}{"type": "string", "enum": []string{"DRAFT", "PUBLISHED", "ARCHIVED"}},
				"parent_id":  map[string]interface{}{"type": "string"},
				"is_pinned":  map[string]interface{}{"type": "boolean"},
				"is_starred": map[string]interface{}{"type": "boolean"},
			},
		},
		Annotations: &ToolAnnotations{Title: "Update Document", DestructiveHint: boolPtr(false)},
	}, s.handleDocsUpdate)

	s.registerTool(Tool{
		Name:        "docs_append_content",
		Description: "Append text or Markdown to the end of an existing document without overwriting earlier content.",
		InputSchema: map[string]interface{}{
			"type":     "object",
			"required": []string{"id", "content"},
			"properties": map[string]interface{}{
				"id":        map[string]interface{}{"type": "string", "description": "Document ID"},
				"content":   map[string]interface{}{"type": "string", "description": "Content to append"},
				"separator": map[string]interface{}{"type": "string", "description": "Separator inserted when doc already has content (default \"\\n\\n\")"},
			},
		},
		Annotations: &ToolAnnotations{Title: "Append Document Content", DestructiveHint: boolPtr(false)},
	}, s.handleDocsAppendContent)

	s.registerTool(Tool{
		Name:        "docs_patch_content",
		Description: "Perform a targeted search-and-replace patch inside a document's content.",
		InputSchema: map[string]interface{}{
			"type":     "object",
			"required": []string{"id", "old_text", "new_text"},
			"properties": map[string]interface{}{
				"id":          map[string]interface{}{"type": "string", "description": "Document ID"},
				"old_text":    map[string]interface{}{"type": "string", "description": "Exact text substring to find"},
				"new_text":    map[string]interface{}{"type": "string", "description": "Replacement text"},
				"replace_all": map[string]interface{}{"type": "boolean", "description": "Replace all occurrences (default false: first occurrence only)"},
			},
		},
		Annotations: &ToolAnnotations{Title: "Patch Document Content", DestructiveHint: boolPtr(false)},
	}, s.handleDocsPatchContent)

	s.registerTool(Tool{
		Name:        "docs_move",
		Description: "Move a document under a different parent document, or to the root level (pass empty string or omit parent_id).",
		InputSchema: map[string]interface{}{
			"type":     "object",
			"required": []string{"id"},
			"properties": map[string]interface{}{
				"id":        map[string]interface{}{"type": "string", "description": "Document ID to move"},
				"parent_id": map[string]interface{}{"type": "string", "description": "Target parent document ID, or empty string \"\" for root"},
			},
		},
		Annotations: &ToolAnnotations{Title: "Move Document", DestructiveHint: boolPtr(false)},
	}, s.handleDocsMove)

	s.registerTool(Tool{
		Name:        "docs_set_flags",
		Description: "Update pin, star, or publication status flags on a document.",
		InputSchema: map[string]interface{}{
			"type":     "object",
			"required": []string{"id"},
			"properties": map[string]interface{}{
				"id":         map[string]interface{}{"type": "string", "description": "Document ID"},
				"is_pinned":  map[string]interface{}{"type": "boolean"},
				"is_starred": map[string]interface{}{"type": "boolean"},
				"status":     map[string]interface{}{"type": "string", "enum": []string{"DRAFT", "PUBLISHED", "ARCHIVED"}},
			},
		},
		Annotations: &ToolAnnotations{Title: "Set Document Flags", DestructiveHint: boolPtr(false)},
	}, s.handleDocsSetFlags)

	s.registerTool(Tool{
		Name:        "docs_delete",
		Description: "Delete a document permanently by ID.",
		InputSchema: map[string]interface{}{
			"type":     "object",
			"required": []string{"id"},
			"properties": map[string]interface{}{
				"id": map[string]interface{}{"type": "string", "description": "Document ID"},
			},
		},
		Annotations: &ToolAnnotations{Title: "Delete Document", DestructiveHint: boolPtr(true)},
	}, s.handleDocsDelete)

	s.registerTool(Tool{
		Name:        "docs_list_revisions",
		Description: "List revision history versions for a document.",
		InputSchema: map[string]interface{}{
			"type":     "object",
			"required": []string{"id"},
			"properties": map[string]interface{}{
				"id": map[string]interface{}{"type": "string", "description": "Document ID"},
			},
		},
		Annotations: &ToolAnnotations{Title: "List Document Revisions", ReadOnlyHint: boolPtr(true)},
	}, s.handleDocsListRevisions)

	s.registerTool(Tool{
		Name:        "docs_get_revision",
		Description: "Get a specific revision version snapshot for a document.",
		InputSchema: map[string]interface{}{
			"type":     "object",
			"required": []string{"id", "version"},
			"properties": map[string]interface{}{
				"id":      map[string]interface{}{"type": "string", "description": "Document ID"},
				"version": map[string]interface{}{"type": "integer", "description": "Revision version number"},
			},
		},
		Annotations: &ToolAnnotations{Title: "Get Document Revision", ReadOnlyHint: boolPtr(true)},
	}, s.handleDocsGetRevision)

	s.registerTool(Tool{
		Name:        "series_list",
		Description: "List or search document series (collections).",
		InputSchema: map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"search": map[string]interface{}{"type": "string", "description": "Optional search query matching series name or description"},
				"page":   map[string]interface{}{"type": "integer", "description": "0-based page index (default 0)"},
				"size":   map[string]interface{}{"type": "integer", "description": "Page size (default 20)"},
			},
		},
		Annotations: &ToolAnnotations{Title: "List Series", ReadOnlyHint: boolPtr(true)},
	}, s.handleSeriesList)

	s.registerTool(Tool{
		Name:        "series_create",
		Description: "Create a new document series.",
		InputSchema: map[string]interface{}{
			"type":     "object",
			"required": []string{"name"},
			"properties": map[string]interface{}{
				"name":        map[string]interface{}{"type": "string", "description": "Series name"},
				"description": map[string]interface{}{"type": "string", "description": "Optional series description"},
			},
		},
		Annotations: &ToolAnnotations{Title: "Create Series", DestructiveHint: boolPtr(false)},
	}, s.handleSeriesCreate)

	s.registerTool(Tool{
		Name:        "series_update",
		Description: "Update an existing document series name or description.",
		InputSchema: map[string]interface{}{
			"type":     "object",
			"required": []string{"id"},
			"properties": map[string]interface{}{
				"id":          map[string]interface{}{"type": "integer", "description": "Series numeric ID"},
				"name":        map[string]interface{}{"type": "string"},
				"description": map[string]interface{}{"type": "string"},
			},
		},
		Annotations: &ToolAnnotations{Title: "Update Series", DestructiveHint: boolPtr(false)},
	}, s.handleSeriesUpdate)

	s.registerTool(Tool{
		Name:        "series_delete",
		Description: "Delete a document series by numeric ID.",
		InputSchema: map[string]interface{}{
			"type":     "object",
			"required": []string{"id"},
			"properties": map[string]interface{}{
				"id": map[string]interface{}{"type": "integer", "description": "Series numeric ID"},
			},
		},
		Annotations: &ToolAnnotations{Title: "Delete Series", DestructiveHint: boolPtr(true)},
	}, s.handleSeriesDelete)
}

func (s *Server) handleDocsList(ctx context.Context, userID string, raw json.RawMessage) (*CallToolResult, error) {
	var args struct {
		Page     int     `json:"page"`
		PageSize int     `json:"page_size"`
		ParentID *string `json:"parent_id"`
		Search   string  `json:"search"`
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
	res, err := s.docsService.ListDocs(ctx, userID, args.ParentID, args.Page, args.PageSize, args.Search)
	if err != nil {
		return textResult("failed to list docs: "+err.Error(), true), nil
	}
	return jsonResult(res)
}

func (s *Server) handleDocsSearch(ctx context.Context, userID string, raw json.RawMessage) (*CallToolResult, error) {
	var args struct {
		Query    string `json:"query"`
		Page     int    `json:"page"`
		PageSize int    `json:"page_size"`
	}
	if err := decodeArgs(raw, &args); err != nil {
		return textResult("invalid arguments: "+err.Error(), true), nil
	}
	if strings.TrimSpace(args.Query) == "" {
		return textResult("query is required", true), nil
	}
	if args.Page <= 0 {
		args.Page = 1
	}
	if args.PageSize <= 0 {
		args.PageSize = 20
	}
	res, err := s.docsService.ListDocs(ctx, userID, nil, args.Page, args.PageSize, args.Query)
	if err != nil {
		return textResult("failed to search docs: "+err.Error(), true), nil
	}
	return jsonResult(res)
}

func (s *Server) handleDocsTree(ctx context.Context, userID string, _ json.RawMessage) (*CallToolResult, error) {
	tree, err := s.docsService.GetDocTree(ctx, userID)
	if err != nil {
		return textResult("failed to fetch doc tree: "+err.Error(), true), nil
	}
	return jsonResult(map[string]interface{}{"tree": tree})
}

const defaultDocsGetMaxChars = 32768

type markdownHeading struct {
	Line       int    `json:"line"`
	CharOffset int    `json:"char_offset"`
	Level      int    `json:"level"`
	Text       string `json:"text"`
}

func extractMarkdownHeadings(content string) ([]markdownHeading, int) {
	normalized := strings.ReplaceAll(content, "\r\n", "\n")
	lines := strings.Split(normalized, "\n")
	headings := []markdownHeading{}
	charOffset := 0
	inFence := false

	for idx, line := range lines {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "```") {
			inFence = !inFence
		} else if !inFence && strings.HasPrefix(line, "#") {
			level := 0
			for level < len(line) && line[level] == '#' {
				level++
			}
			if level >= 1 && level <= 6 && len(line) > level && (line[level] == ' ' || line[level] == '\t') {
				text := strings.TrimSpace(line[level+1:])
				headings = append(headings, markdownHeading{
					Line:       idx + 1,
					CharOffset: charOffset,
					Level:      level,
					Text:       text,
				})
			}
		}
		charOffset += len([]rune(line))
		if idx < len(lines)-1 {
			charOffset++ // newline rune
		}
	}
	return headings, len([]rune(normalized))
}

func (s *Server) handleDocsGet(ctx context.Context, _ string, raw json.RawMessage) (*CallToolResult, error) {
	var args struct {
		ID          string `json:"id"`
		Slug        string `json:"slug"`
		Offset      int    `json:"offset"`
		Limit       int    `json:"limit"`
		OutlineOnly bool   `json:"outline_only"`
	}
	if err := decodeArgs(raw, &args); err != nil {
		return textResult("invalid arguments: "+err.Error(), true), nil
	}
	var (
		doc *dto.DocDto
		err error
	)
	if args.ID != "" {
		doc, err = s.docsService.GetDocByID(ctx, args.ID)
	} else if args.Slug != "" {
		doc, err = s.docsService.GetDocBySlug(ctx, args.Slug)
	} else {
		return textResult("either id or slug is required", true), nil
	}
	if err != nil {
		return textResult(err.Error(), true), nil
	}

	if args.OutlineOnly {
		headings, totalChars := extractMarkdownHeadings(doc.Content)
		return jsonResult(map[string]interface{}{
			"id":          doc.ID,
			"title":       doc.Title,
			"slug":        doc.Slug,
			"status":      doc.Status,
			"parent_id":   doc.ParentID,
			"is_pinned":   doc.IsPinned,
			"is_starred":  doc.IsStarred,
			"total_chars": totalChars,
			"headings":    headings,
		})
	}

	runes := []rune(doc.Content)
	totalChars := len(runes)
	offset := args.Offset
	if offset < 0 {
		offset = 0
	}
	if offset > totalChars {
		offset = totalChars
	}

	limit := args.Limit
	if limit <= 0 {
		limit = defaultDocsGetMaxChars
	}
	end := offset + limit
	if end > totalChars {
		end = totalChars
	}

	hasMore := end < totalChars
	var nextOffset *int
	if hasMore {
		n := end
		nextOffset = &n
	}

	docCopy := *doc
	docCopy.Content = string(runes[offset:end])

	return jsonResult(struct {
		*dto.DocDto
		TotalChars    int  `json:"total_chars"`
		Offset        int  `json:"offset"`
		ReturnedChars int  `json:"returned_chars"`
		Truncated     bool `json:"truncated"`
		HasMore       bool `json:"has_more"`
		NextOffset    *int `json:"next_offset"`
	}{
		DocDto:        &docCopy,
		TotalChars:    totalChars,
		Offset:        offset,
		ReturnedChars: end - offset,
		Truncated:     hasMore || offset > 0,
		HasMore:       hasMore,
		NextOffset:    nextOffset,
	})
}

func (s *Server) handleDocsCreate(ctx context.Context, userID string, raw json.RawMessage) (*CallToolResult, error) {
	var args struct {
		Title    string  `json:"title"`
		Content  string  `json:"content"`
		Status   string  `json:"status"`
		ParentID *string `json:"parent_id"`
	}
	if err := decodeArgs(raw, &args); err != nil {
		return textResult("invalid arguments: "+err.Error(), true), nil
	}
	if strings.TrimSpace(args.Title) == "" {
		return textResult("title is required", true), nil
	}
	status := domain.DocStatus(args.Status)
	if status != "" && status != domain.DocStatusDraft && status != domain.DocStatusPublished && status != domain.DocStatusArchived {
		return textResult("status must be DRAFT, PUBLISHED, or ARCHIVED", true), nil
	}
	doc, err := s.docsService.CreateDoc(ctx, userID, dto.CreateDocRequest{
		Title:    args.Title,
		Content:  args.Content,
		Status:   status,
		ParentID: args.ParentID,
	})
	if err != nil {
		return textResult("failed to create doc: "+err.Error(), true), nil
	}
	return jsonResult(doc)
}

func (s *Server) handleDocsUpdate(ctx context.Context, userID string, raw json.RawMessage) (*CallToolResult, error) {
	var args struct {
		ID        string  `json:"id"`
		Title     *string `json:"title"`
		Content   *string `json:"content"`
		Status    *string `json:"status"`
		ParentID  *string `json:"parent_id"`
		IsPinned  *bool   `json:"is_pinned"`
		IsStarred *bool   `json:"is_starred"`
	}
	if err := decodeArgs(raw, &args); err != nil {
		return textResult("invalid arguments: "+err.Error(), true), nil
	}
	if args.ID == "" {
		return textResult("id is required", true), nil
	}
	var statusPtr *domain.DocStatus
	if args.Status != nil {
		st := domain.DocStatus(*args.Status)
		if st != domain.DocStatusDraft && st != domain.DocStatusPublished && st != domain.DocStatusArchived {
			return textResult("status must be DRAFT, PUBLISHED, or ARCHIVED", true), nil
		}
		statusPtr = &st
	}
	doc, err := s.docsService.UpdateDoc(ctx, args.ID, userID, dto.UpdateDocRequest{
		Title:     args.Title,
		Content:   args.Content,
		Status:    statusPtr,
		ParentID:  args.ParentID,
		IsPinned:  args.IsPinned,
		IsStarred: args.IsStarred,
	})
	if err != nil {
		return textResult("failed to update doc: "+err.Error(), true), nil
	}
	return jsonResult(doc)
}

func (s *Server) handleDocsAppendContent(ctx context.Context, userID string, raw json.RawMessage) (*CallToolResult, error) {
	var args struct {
		ID        string  `json:"id"`
		Content   string  `json:"content"`
		Separator *string `json:"separator"`
	}
	if err := decodeArgs(raw, &args); err != nil {
		return textResult("invalid arguments: "+err.Error(), true), nil
	}
	if args.ID == "" || args.Content == "" {
		return textResult("id and content are required", true), nil
	}
	doc, err := s.docsService.GetDocByID(ctx, args.ID)
	if err != nil {
		return textResult(err.Error(), true), nil
	}
	sep := "\n\n"
	if args.Separator != nil {
		sep = *args.Separator
	}
	nextContent := args.Content
	if doc.Content != "" {
		nextContent = doc.Content + sep + args.Content
	}
	updated, err := s.docsService.UpdateDoc(ctx, doc.ID, userID, dto.UpdateDocRequest{
		Content: &nextContent,
	})
	if err != nil {
		return textResult("failed to append content: "+err.Error(), true), nil
	}
	return jsonResult(updated)
}

func (s *Server) handleDocsPatchContent(ctx context.Context, userID string, raw json.RawMessage) (*CallToolResult, error) {
	var args struct {
		ID         string `json:"id"`
		OldText    string `json:"old_text"`
		NewText    string `json:"new_text"`
		ReplaceAll bool   `json:"replace_all"`
	}
	if err := decodeArgs(raw, &args); err != nil {
		return textResult("invalid arguments: "+err.Error(), true), nil
	}
	if args.ID == "" || args.OldText == "" {
		return textResult("id and old_text are required", true), nil
	}
	doc, err := s.docsService.GetDocByID(ctx, args.ID)
	if err != nil {
		return textResult(err.Error(), true), nil
	}
	if !strings.Contains(doc.Content, args.OldText) {
		return textResult("old_text was not found in document content", true), nil
	}
	var nextContent string
	if args.ReplaceAll {
		nextContent = strings.ReplaceAll(doc.Content, args.OldText, args.NewText)
	} else {
		nextContent = strings.Replace(doc.Content, args.OldText, args.NewText, 1)
	}
	updated, err := s.docsService.UpdateDoc(ctx, doc.ID, userID, dto.UpdateDocRequest{
		Content: &nextContent,
	})
	if err != nil {
		return textResult("failed to patch content: "+err.Error(), true), nil
	}
	return jsonResult(updated)
}

func (s *Server) handleDocsMove(ctx context.Context, userID string, raw json.RawMessage) (*CallToolResult, error) {
	var args struct {
		ID       string  `json:"id"`
		ParentID *string `json:"parent_id"`
	}
	if err := decodeArgs(raw, &args); err != nil {
		return textResult("invalid arguments: "+err.Error(), true), nil
	}
	if args.ID == "" {
		return textResult("id is required", true), nil
	}
	empty := ""
	parentPtr := args.ParentID
	if parentPtr == nil {
		parentPtr = &empty
	}
	if *parentPtr == args.ID {
		return textResult("a document cannot be its own parent", true), nil
	}
	updated, err := s.docsService.UpdateDoc(ctx, args.ID, userID, dto.UpdateDocRequest{
		ParentID: parentPtr,
	})
	if err != nil {
		return textResult("failed to move doc: "+err.Error(), true), nil
	}
	return jsonResult(updated)
}

func (s *Server) handleDocsSetFlags(ctx context.Context, userID string, raw json.RawMessage) (*CallToolResult, error) {
	var args struct {
		ID        string  `json:"id"`
		IsPinned  *bool   `json:"is_pinned"`
		IsStarred *bool   `json:"is_starred"`
		Status    *string `json:"status"`
	}
	if err := decodeArgs(raw, &args); err != nil {
		return textResult("invalid arguments: "+err.Error(), true), nil
	}
	if args.ID == "" {
		return textResult("id is required", true), nil
	}
	var statusPtr *domain.DocStatus
	if args.Status != nil {
		st := domain.DocStatus(*args.Status)
		if st != domain.DocStatusDraft && st != domain.DocStatusPublished && st != domain.DocStatusArchived {
			return textResult("status must be DRAFT, PUBLISHED, or ARCHIVED", true), nil
		}
		statusPtr = &st
	}
	updated, err := s.docsService.UpdateDoc(ctx, args.ID, userID, dto.UpdateDocRequest{
		IsPinned:  args.IsPinned,
		IsStarred: args.IsStarred,
		Status:    statusPtr,
	})
	if err != nil {
		return textResult("failed to update flags: "+err.Error(), true), nil
	}
	return jsonResult(updated)
}

func (s *Server) handleDocsDelete(ctx context.Context, userID string, raw json.RawMessage) (*CallToolResult, error) {
	var args struct {
		ID string `json:"id"`
	}
	if err := decodeArgs(raw, &args); err != nil {
		return textResult("invalid arguments: "+err.Error(), true), nil
	}
	if args.ID == "" {
		return textResult("id is required", true), nil
	}
	if err := s.docsService.DeleteDoc(ctx, args.ID, userID); err != nil {
		if errors.Is(err, service.ErrDocNotFound) {
			return textResult("document not found", true), nil
		}
		return textResult("failed to delete doc: "+err.Error(), true), nil
	}
	return jsonResult(map[string]interface{}{"deleted": true, "id": args.ID})
}

func (s *Server) handleDocsListRevisions(ctx context.Context, _ string, raw json.RawMessage) (*CallToolResult, error) {
	var args struct {
		ID string `json:"id"`
	}
	if err := decodeArgs(raw, &args); err != nil {
		return textResult("invalid arguments: "+err.Error(), true), nil
	}
	if args.ID == "" {
		return textResult("id is required", true), nil
	}
	revs, err := s.docsService.GetRevisions(ctx, args.ID)
	if err != nil {
		return textResult("failed to list revisions: "+err.Error(), true), nil
	}
	return jsonResult(map[string]interface{}{"doc_id": args.ID, "revisions": revs})
}

func (s *Server) handleDocsGetRevision(ctx context.Context, _ string, raw json.RawMessage) (*CallToolResult, error) {
	var args struct {
		ID      string `json:"id"`
		Version int    `json:"version"`
	}
	if err := decodeArgs(raw, &args); err != nil {
		return textResult("invalid arguments: "+err.Error(), true), nil
	}
	if args.ID == "" || args.Version <= 0 {
		return textResult("id and positive version are required", true), nil
	}
	res, err := s.yjsService.ReconstructDocument(ctx, args.ID, args.Version)
	if err != nil {
		return textResult(fmt.Sprintf("revision v%d not found for doc %s", args.Version, args.ID), true), nil
	}
	return jsonResult(res)
}

func (s *Server) handleSeriesList(ctx context.Context, _ string, raw json.RawMessage) (*CallToolResult, error) {
	var args struct {
		Search string `json:"search"`
		Page   int    `json:"page"`
		Size   int    `json:"size"`
	}
	if err := decodeArgs(raw, &args); err != nil {
		return textResult("invalid arguments: "+err.Error(), true), nil
	}
	if args.Page < 0 {
		args.Page = 0
	}
	if args.Size <= 0 {
		args.Size = 20
	}

	var list []domain.Series
	var total int64
	q := s.db.WithContext(ctx).Model(&domain.Series{})
	if args.Search != "" {
		like := "%" + args.Search + "%"
		q = q.Where("name LIKE ? OR description LIKE ?", like, like)
	}
	if err := q.Count(&total).Error; err != nil {
		return textResult("failed to count series: "+err.Error(), true), nil
	}
	if err := q.Offset(args.Page * args.Size).Limit(args.Size).Order("id asc").Find(&list).Error; err != nil {
		return textResult("failed to list series: "+err.Error(), true), nil
	}
	return jsonResult(map[string]interface{}{
		"items":     list,
		"total":     total,
		"page":      args.Page,
		"page_size": args.Size,
	})
}

func (s *Server) handleSeriesCreate(ctx context.Context, userID string, raw json.RawMessage) (*CallToolResult, error) {
	var args struct {
		Name        string `json:"name"`
		Description string `json:"description"`
	}
	if err := decodeArgs(raw, &args); err != nil {
		return textResult("invalid arguments: "+err.Error(), true), nil
	}
	if strings.TrimSpace(args.Name) == "" {
		return textResult("name is required", true), nil
	}
	series := domain.Series{
		Name:        args.Name,
		Description: args.Description,
		CreatedByID: userID,
	}
	if err := s.db.WithContext(ctx).Create(&series).Error; err != nil {
		return textResult("failed to create series: "+err.Error(), true), nil
	}
	return jsonResult(series)
}

func (s *Server) handleSeriesUpdate(ctx context.Context, _ string, raw json.RawMessage) (*CallToolResult, error) {
	var args struct {
		ID          uint    `json:"id"`
		Name        *string `json:"name"`
		Description *string `json:"description"`
	}
	if err := decodeArgs(raw, &args); err != nil {
		return textResult("invalid arguments: "+err.Error(), true), nil
	}
	if args.ID == 0 {
		return textResult("id is required", true), nil
	}
	var series domain.Series
	if err := s.db.WithContext(ctx).First(&series, args.ID).Error; err != nil {
		return textResult("series not found", true), nil
	}
	if args.Name != nil && *args.Name != "" {
		series.Name = *args.Name
	}
	if args.Description != nil {
		series.Description = *args.Description
	}
	if err := s.db.WithContext(ctx).Save(&series).Error; err != nil {
		return textResult("failed to update series: "+err.Error(), true), nil
	}
	return jsonResult(series)
}

func (s *Server) handleSeriesDelete(ctx context.Context, _ string, raw json.RawMessage) (*CallToolResult, error) {
	var args struct {
		ID uint `json:"id"`
	}
	if err := decodeArgs(raw, &args); err != nil {
		return textResult("invalid arguments: "+err.Error(), true), nil
	}
	if args.ID == 0 {
		return textResult("id is required", true), nil
	}
	res := s.db.WithContext(ctx).Delete(&domain.Series{}, args.ID)
	if res.Error != nil {
		return textResult("failed to delete series: "+res.Error.Error(), true), nil
	}
	if res.RowsAffected == 0 {
		return textResult("series not found", true), nil
	}
	return jsonResult(map[string]interface{}{"deleted": true, "id": args.ID})
}
