# Realtime và cơ hội tối ưu

Khảo sát ngày 29/10/2026, nguồn chính `app.1446406d.js`. Các khuyến nghị là đề xuất thiết kế SDK, chưa phải tính năng đã triển khai hoặc kết quả benchmark.

## Giao thức nhìn thấy trong mã

- URL SockJS: `https://<workspace-host>/websocket`.
- Broker URL được cấu hình: `wss://<workspace-host>/websocket`.
- STOMP client có `webSocketFactory` tạo SockJS. Vì vậy không nên chỉ mở native WebSocket tới broker URL rồi giả định đã tương đương frontend.
- `reconnectDelay: 3000`, `heartbeatIncoming: 4000`, `heartbeatOutgoing: 4000`.
- Không thấy `connectHeaders` trong đoạn khởi tạo client đã đọc. Điều này không đủ kết luận server không xác thực kết nối.
- Request không xác thực tới `/websocket/info` trả HTTP 200 và `cookie_needed: true`, `websocket: true`. Đây là thông tin SockJS, chưa xác định cookie xác thực cụ thể.

## Subscription

| Destination | Nguồn ID | Một số nội dung frontend xử lý |
| --- | --- | --- |
| `/session/{sessionId}` | `sessionId` đọc từ verify | `profileInfo`, `friendStatus`, `onlineStatus`, `pinList`, `filterMessageTab`, `SearchMessageDto`, `SearchMessageInnerDto`, `sendByList`, `zaloReactionList` |
| `/user/{swUsername}` | `user.swUsername` đọc từ verify | `logoutUser` |
| `/chat/{accountId}` | Danh sách tài khoản | `read`, `sendBy`, `zaloReaction`, `typing`, `hidden_conversation`, `conversation_tag`, `eventGetCommonGroup`, `updateGrMessage`, `renew_link`, `addNewMessage`, dữ liệu message/conversation ở nhánh mặc định |

Không thử subscribe vào bất kỳ destination nào. Cần kiểm chứng quyền trên tài khoản hợp lệ và cách server ràng buộc phiên.

Tên sự kiện backend và tên sự kiện nội bộ UI có thể khác nhau. Ví dụ `read` được chuyển thành `conversationRead`, `addNewMessage` thành `messageUpdate` và `currentConversationUpdate`. SDK nên giữ được sự kiện gốc để chẩn đoán trước khi chuẩn hóa.

## Những điểm nên thiết kế khác trong SDK

1. **Gộp request xác minh phiên đang chạy.** Interceptor frontend có thể phát `Reverify` ở nhiều request gần nhau. SDK nên có một tác vụ verify dùng chung cho mỗi phiên và xử lý thất bại rõ ràng.
2. **Chống trùng request theo cả tài khoản và payload.** Mã frontend có bảng hủy request theo tên endpoint cho một số API. Nếu dùng khóa quá rộng trong SDK nhiều tài khoản, request này có thể hủy request khác không cùng dữ liệu.
3. **Quản lý một kết nối realtime có vòng đời rõ ràng cho mỗi phiên SDK.** Đoạn wrapper đã đọc khai báo `$e = null` nhưng chưa thấy gán client mới vào `$e`, trong khi các hàm kiểm tra/disconnect tham chiếu `$e`. Đây là nghi vấn từ mã tĩnh, chưa xác nhận lỗi runtime. Không sao chép wrapper nguyên trạng.
4. **Kết hợp HTTP và event.** Một số caller V2 không đọc response HTTP, có handler sự kiện liên quan. Cần xác định correlation ID, timeout và hủy chờ để hai truy vấn đồng thời không nhận nhầm kết quả.
5. **Phân loại thao tác theo tác dụng, không theo method.** Gửi/thu hồi lời mời và QR dùng GET nhưng thay đổi trạng thái. Chỉ retry thao tác ghi khi có bằng chứng về tính an toàn và chống trùng.
6. **Tách cursor theo loại dữ liệu.** Hội thoại dùng `lastMessageTime`, lịch sử tin nhắn dùng `timestamp`, danh bạ có `page/pageSize`. Không ép các route vào cùng một cơ chế phân trang.
7. **Giữ nội dung gửi đến khi xác nhận kết quả.** Một số caller xóa ô nhập trước khi nhận response. SDK cần trả kết quả hoặc lỗi đủ rõ để ứng dụng biết tin đã gửi, đang chờ hay chưa xác định.
8. **Đo trước khi gọi là tối ưu.** Ghi số request, độ trễ p50/p95, reconnect, lỗi và số bản ghi trùng của cùng một kịch bản. Chưa có số đo để khẳng định nhanh hơn hoặc giảm tải bao nhiêu.

## Điều cần đo hoặc kiểm chứng tiếp

- Handshake SockJS/STOMP, cookie, frame CONNECT và subscribe của một phiên hợp lệ.
- Request gửi tin đối chiếu HTTP response với message/event phản hồi.
- Biên cursor và thứ tự dữ liệu khi lịch sử thay đổi trong lúc phân trang.
- Hành vi nhiều tài khoản, token hết hạn và mất kết nối.
- Response envelope theo từng API, bao gồm trường hợp HTTP 200 nhưng error_code khác 0.
