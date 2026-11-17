# Tổng quan kế hoạch (bản chốt)

## 1. Mục tiêu
Biến Gemini CLI thành trợ lý quản trị cho server 1.9 GB RAM: nhận lệnh qua web hoặc API, chat, gọi API ngoài, sửa file md/json, thao tác lên server theo quyền hạn có kiểm soát. Mọi hành động có rủi ro đều cần bạn duyệt.

## 2. Các quyết định đã chốt

| Hạng mục | Quyết định |
|---|---|
| Gemini CLI | Chạy **trực tiếp trên host**, dưới user `gemops` |
| Giao thức với CLI | **ACP** (`gemini --acp`, JSON-RPC qua stdio), thay cho `--yolo` |
| Backend | **Go**, chạy trên host, **không mở cổng TCP**, chỉ lắng nghe unix socket |
| Giao tiếp Docker ↔ Go | **HTTP + SSE** qua unix socket `/run/agent/agent.sock` (quyền `0660`) |
| Service Docker | Web UI + xác thực, là thành phần duy nhất tiếp xúc người dùng |
| Quản lý phiên | Go chủ động compact, đóng phiên và reset |

## 3. Kiến trúc

```
Internet/Tailscale
      ↓ HTTPS + xác thực
[Docker: web UI + auth]
      ↓ unix socket (HTTP + SSE)
[Go wrapper (host, user gemops)]
   ├─ chính sách duyệt, log kiểm toán, watchdog RAM
      ↓ stdio JSON-RPC (ACP)
gemini --acp
      ↓ sudoers whitelist (tùy chọn SSH)
Server
```

## 4. Cơ chế duyệt
- Agent gửi `session/request_permission`, Go quyết định:
  - **Đọc/tìm kiếm:** tự động cho phép.
  - **Mẫu nguy hiểm** (`rm -rf`, `dd`, `mkfs`, `/etc/ssh`, reboot, đọc `.env` hoặc key...): tự động từ chối.
  - **Ghi file, chạy lệnh, xóa, fetch:** đẩy lên web qua SSE, chờ bạn chọn; **2 phút không trả lời thì từ chối**.
- Quyết định chỉ đến từ thao tác bấm của người thật đã xác thực, không để service Docker tự "allow" hàng loạt.

## 5. Quản lý RAM và ngữ cảnh

| Điều kiện | Hành động |
|---|---|
| RSS > 450 MB và đang rảnh | compact rồi đóng phiên |
| Nhàn rỗi > 10 phút | compact rồi đóng phiên |
| RSS > 650 MB (kể cả đang chạy) | kill ngay, dùng bản tóm tắt gần nhất |
| `POST /reset` | reset trắng, hoặc `?compact=1` để tóm tắt trước |

Quy trình compact: Gemini viết bản tóm tắt tối đa 300 từ, Go lưu lại, kill tiến trình (trả RAM hoàn toàn), phiên mới được chèn tóm tắt vào prompt đầu tiên. Chỉ **một phiên một lúc**, timeout 5 phút mỗi lượt.

Ngân sách RAM: Gemini 300-500 MB, Go 15-30 MB, web 50-100 MB. Systemd đặt `MemoryHigh=700M` và `MemoryMax=900M` làm lưới an toàn cho cả cây tiến trình.

## 5b. API của Go wrapper
`POST /prompt`, `GET /events` (SSE), `POST /permissions/{id}`, `POST /cancel`, `POST /reset`, `GET /status`.

## 6. Bảo mật (theo thứ tự quan trọng)
1. **User `gemops`**: không thuộc nhóm `sudo` hay `docker`, chỉ có whitelist sudoers. Đây là lớp bảo vệ thật, vì bước duyệt có thể bị bấm nhầm và regex chỉ là lọc nhanh.
2. Go không có cổng mạng; service Docker đặt sau Tailscale hoặc Cloudflare Access, HTTPS, token mạnh.
3. Log kiểm toán ở Go: prompt, tool call, quyết định duyệt, thời gian.
4. Bí mật để ở biến môi trường (`/etc/agent.env`, `chmod 600`), không để trong file mà agent đọc, vì nội dung file được gửi lên Google.
5. Cẩn thận prompt injection từ log, web, API response.
6. Thư mục agent được ghi nên có git hoặc backup.

## 7. Các bước triển khai
1. **Kiểm tra nền tảng:** Gemini CLI còn được hỗ trợ hay đã chuyển sang Antigravity CLI; xác nhận cờ `--acp` bằng `gemini --help`.
2. **Chuẩn bị server:** swap 1-2 GB, Node 22 (cài cho user `gemops`), cài `@google/gemini-cli`.
3. **Tạo `gemops`** và nhóm `agentclients`, file sudoers whitelist, thư mục `/srv/agent-data`.
4. **Viết `GEMINI.md`** mô tả quy hoạch thư mục, mapping và quy tắc làm việc.
5. **Build Go wrapper** (`GOOS=linux GOARCH=arm64`, nên build trên máy khác), cài file systemd, chạy thử bằng `curl --unix-socket`.
6. **Viết service Docker** (web UI, xác thực, chuyển tiếp SSE, nút duyệt), mount `/run/agent` kèm `--group-add`.
7. **Chạy thử theo thang quyền:** chỉ đọc trước, rồi ghi file, rồi mới đến lệnh hệ thống.

## 8. Các điểm chưa xác nhận (cần kiểm tra khi chạy thử)
- Tên cờ `--acp` ở phiên bản bạn cài, và có cần bước `authenticate` hay không.
- Tên trường thực tế trong `session/update` và `session/request_permission`: hãy ghi log nguyên bản message ở lần chạy đầu rồi chỉnh code.
- Việc compact đang dùng cách tóm tắt bằng prompt do Go làm, chưa dựa vào `/compress` của CLI.
- Bộ khung Go tôi đưa ra **chưa được chạy thử**, nên coi nó là điểm khởi đầu, không phải bản hoàn chỉnh.
- RAM thực tế của Gemini là ước lượng; hãy đo bằng `ps -o rss` hoặc `/status` rồi chỉnh ngưỡng.

## 9. Việc có thể làm tiếp
- Trang HTML tối giản cho service Docker (nhập lệnh, xem luồng, nút duyệt/từ chối).
- File sudoers, `authorized_keys` và `GEMINI.md` mẫu theo danh sách việc quản trị bạn cần.
- Docker Compose cho service web, kèm cấu hình mount socket.