package mcp

import "fmt"

func (s *Server) listPrompts() *ListPromptsResult {
	return &ListPromptsResult{
		Prompts: []Prompt{
			{
				Name:        "write_doc_outline",
				Description: "Draft a structured outline and initial sections for a new Tomo document.",
				Arguments: []PromptArgument{
					{Name: "topic", Description: "Topic or title for the document", Required: true},
					{Name: "audience", Description: "Target audience (e.g., engineers, product, onboarding)"},
				},
			},
			{
				Name:        "review_and_improve_doc",
				Description: "Read an existing Tomo document, suggest clarity/structure improvements, and apply targeted patches.",
				Arguments: []PromptArgument{
					{Name: "doc_id", Description: "Target document ID", Required: true},
					{Name: "goal", Description: "Review focus (e.g., conciseness, formatting, examples)"},
				},
			},
			{
				Name:        "diagram_from_doc",
				Description: "Create an Excalidraw architecture or workflow diagram based on a Tomo document's content.",
				Arguments: []PromptArgument{
					{Name: "doc_id", Description: "Source document ID", Required: true},
					{Name: "canvas_title", Description: "Title for the new canvas"},
				},
			},
		},
	}
}

func (s *Server) getPrompt(name string, args map[string]string) (*GetPromptResult, error) {
	switch name {
	case "write_doc_outline":
		topic := args["topic"]
		if topic == "" {
			topic = "New Technical Document"
		}
		audience := args["audience"]
		if audience == "" {
			audience = "general team members"
		}
		return &GetPromptResult{
			Description: "Draft a structured outline for a Tomo document",
			Messages: []PromptMessage{
				{
					Role: "user",
					Content: ContentBlock{
						Type: "text",
						Text: fmt.Sprintf(
							"Create a well-structured document outline about %q for %s. First check existing documents with `docs_list` / `docs_tree` to match workspace conventions and avoid duplicates, then create the document using `docs_create` (or `docs_write_markdown` if using the realtime Yjs MCP server).",
							topic, audience,
						),
					},
				},
			},
		}, nil

	case "review_and_improve_doc":
		docID := args["doc_id"]
		goal := args["goal"]
		if goal == "" {
			goal = "clarity, completeness, and clean formatting"
		}
		return &GetPromptResult{
			Description: "Review and refine an existing Tomo document",
			Messages: []PromptMessage{
				{
					Role: "user",
					Content: ContentBlock{
						Type: "text",
						Text: fmt.Sprintf(
							"Fetch document %q via `docs_get` (and `docs_read_live` if available). Review it focusing on %s. Summarize proposed edits briefly and apply clean incremental updates using `docs_patch_content` or block-level tools.",
							docID, goal,
						),
					},
				},
			},
		}, nil

	case "diagram_from_doc":
		docID := args["doc_id"]
		title := args["canvas_title"]
		if title == "" {
			title = "Architecture Diagram"
		}
		return &GetPromptResult{
			Description: "Generate an Excalidraw canvas diagram from a document",
			Messages: []PromptMessage{
				{
					Role: "user",
					Content: ContentBlock{
						Type: "text",
						Text: fmt.Sprintf(
							"Read document %q using `docs_get`. Extract the core components, flows, or entities, create a canvas titled %q using `canvas_create`, and populate it with well-spaced shapes, labels, and arrows using `canvas_add_elements` (or `canvas_add_diagram`).",
							docID, title,
						),
					},
				},
			},
		}, nil

	default:
		return nil, fmt.Errorf("unknown prompt: %s", name)
	}
}
