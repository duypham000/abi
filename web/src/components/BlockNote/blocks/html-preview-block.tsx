import { createReactBlockSpec } from "@blocknote/react";

export const htmlPreviewBlock = createReactBlockSpec(
  {
    type: "htmlPreview" as const,
    propSchema: {
      code: { default: "" },
      height: { default: "200px" },
    },
    content: "none",
  },
  {
    render: ({ block }) => {
      const { code, height } = block.props;
      return (
        <div style={{ width: "100%", borderRadius: 8, overflow: "hidden", border: "1px solid #e5e7eb" }}>
          <iframe
            srcDoc={code as string}
            sandbox="allow-scripts"
            style={{
              width: "100%",
              height: height as string,
              border: "none",
              display: "block",
            }}
            title="HTML Preview"
          />
        </div>
      );
    },
  }
);
