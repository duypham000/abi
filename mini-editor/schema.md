Mô hình bạn vừa mô tả chính là **"Workspace Architecture"** chuẩn hiện nay (tương tự cách Obsidian Canvas hay Muse.app đang vận hành).

Để đạt được trải nghiệm này một cách mượt mà, tùy biến sâu và **100% miễn phí (MIT License)**, bạn không nên tìm một thư viện "tất cả trong một" nữa. Thay vào đó, giải pháp tốt nhất là **Tách biệt hai tầng (Decoupled)** và gắn kết chúng bằng một **Tầng quản lý trạng thái (State Management) + Layout Split View**.

Dưới đây là kiến trúc và blueprint chi tiết để bạn tự lắp ghép giải pháp này một cách chuyên nghiệp.

---

## 1. Bộ công nghệ (The Stack) khuyên dùng

* **Tầng Whiteboard (Vẽ tự do):** **Excalidraw** (`@excalidraw/excalidraw`) — *MIT License*. Thằng này vô địch về vẽ tay tự do, mượt mà, hỗ trợ tạo các khung (frames) và các khối hình học.
* **Tầng Editor (Đầy đủ như AFFiNE):** **BlockNote** (`@blocknote/react`) — *MIT License*. Giao diện Notion-like ăn liền, có sẵn Slash menu (`/`), kéo thả block, tùy biến được block mới, cực kỳ cao cấp.
* **Tầng Quản lý trạng thái (The Glue):** **Zustand** (Siêu nhẹ, quản lý việc đóng/mở và truyền ID giữa Canvas và Editor).
* **Tầng Giao diện (Layout):** **React-Resizable-Panels** (Để làm tính năng kéo kéo chia đôi màn hình - Split View mượt như VS Code).

---

## 2. Blueprint: Cơ chế hoạt động (Cách chúng "nói chuyện" với nhau)

Bí quyết nằm ở chỗ: **Canvas không chứa Editor, Canvas chỉ chứa "ID" của Editor.**

```
+-----------------------------------------------------------------------+
|  WORKSPACE                                                            |
|  +-----------------------------------+  +--------------------------+  |
|  | WHITEBOARD (Excalidraw)           |  | SPLIT VIEW EDITOR        |  |
|  |                                   |  | (BlockNote)              |  |
|  |  [Card: Feature A] (docId: 123)   |  |                          |  |
|  |         |                         |  | Doc ID: 123              |  |
|  |         v (Click)                 |  |                          |  |
|  |  Triggers Zustand:                |  | Title: Feature A         |  |
|  |  setActiveDocId(123) ------------->  | - Step 1: ...            |  |
|  |                                   |  | - Step 2: ...            |  |
|  +-----------------------------------+  +--------------------------+  |
+-----------------------------------------------------------------------+

```

### Bước 1: Thiết kế cấu trúc dữ liệu (Database Schema)

Bạn cần một cấu trúc dữ liệu phẳng để quản lý toàn bộ Workspace:

```typescript
interface WorkspaceData {
  canvasState: any; // Data JSON xuất ra từ Excalidraw (vẽ bậy, hình khối...)
  documents: {
    [docId: string]: any; // Dữ liệu các bài viết dạng JSON của BlockNote
  };
  links: {
    [excalidrawElementId: string]: string; // Map giữa ID cái hình trên canvas với docId
  };
}

```

### Bước 2: Biến phần tử Canvas thành "Shortcut"

Trong Excalidraw, mọi hình vuông, hình tròn hay text bạn vẽ ra đều có một `id` duy nhất do Excalidraw tự sinh.

* Bạn tạo một tính năng: Khi user chuột phải vào một hình vuông trên Canvas -> Hiện menu "Liên kết với tài liệu".
* Khi họ chọn hoặc tạo một tài liệu mới, bạn lưu mối quan hệ này vào bảng `links` (Ví dụ: `element_rectangle_999: "doc_custom_123"`).

### Bước 3: Bắt sự kiện Click để mở Split View

Excalidraw cung cấp hàm `onPointerUp` hoặc bạn có thể theo dõi sự thay đổi selection của người dùng thông qua API của nó.

```typescript
const onPointerUp = (activeElements: any) => {
  if (activeElements.length === 1) {
    const selectedElementId = activeElements[0].id;
    
    // Kiểm tra xem cái hình vừa click có liên kết với Doc nào không
    const linkedDocId = workspaceStore.links[selectedElementId];
    
    if (linkedDocId) {
      // Kích hoạt Zustand mở thanh Split View bên phải và nạp ID này vào
      workspaceStore.openEditor(linkedDocId);
    }
  }
};

```

### Bước 4: Dựng Split View Editor với BlockNote

Ở phần màn hình bên phải (chỉ hiện lên khi `activeDocId` có giá trị), bạn dùng `react-resizable-panels` để người dùng có thể tùy ý kéo rộng/hẹp tùy thích. Bên trong panel này, bạn gọi BlockNote:

```typescript
import { BlockNoteView, useCreateBlockNote } from "@blocknote/react";

export function SplitViewEditor({ docId }) {
  // Lấy dữ liệu của docId từ Store lên
  const initialContent = useWorkspaceStore((state) => state.documents[docId]);

  const editor = useCreateBlockNote({
    initialContent: initialContent,
    onEditorContentChange: (editor) => {
      // Auto-save nội dung ngược trở lại Store/Database khi người dùng gõ chữ
      saveDocumentToStore(docId, editor.document);
    }
  });

  return <BlockNoteView editor={editor} theme="light" />;
}

```

---

## 3. Tại sao giải pháp kết hợp này tốt hơn AFFiNE hay BlockSuite?

1. **Kiểm soát 100% Layout UI:** Bạn muốn mở Split View bên phải, hay dạng Pop-up, hay Drawer trượt từ dưới lên? Bạn toàn quyền quyết định bằng CSS/Tailwind, không bị bó buộc vào layout cố định của framework.
2. **Độc lập và An toàn:** Nếu sau này Excalidraw ra tính năng mới, bạn chỉ cần nâng cấp Excalidraw. Nếu BlockNote ra block mới, bạn chỉ cần update BlockNote. Hai thằng không "cắn" nhau vì chúng chỉ liên kết qua một cái ID trung gian.
3. **Bảo toàn hiệu năng (Performance):** BlockSuite bị nặng vì nó cố render văn bản trực tiếp lên trên hệ thống tọa độ Canvas. Bằng cách đẩy Editor ra một Panel riêng (Split view), Canvas của bạn chỉ phải render các hình khối nhẹ nhàng, giúp app chạy mượt mà kể cả khi có hàng trăm docs.