# API khảo sát ban đầu

Ngày khảo sát: 29/10/2026, múi giờ Asia/Ho_Chi_Minh.

Nguồn:

- https://<workspace-host>/v2
- https://<workspace-host>/js/app.<hash>.js
- https://<login-host>/login?target=<target>

Đây là bằng chứng đọc frontend công khai, chưa phải hợp đồng API được kiểm chứng bằng request có xác thực. Tên file bundle có thể thay đổi khi nhà cung cấp phát hành phiên bản mới.

## Khảo sát mở rộng

Đã tải và phân tích 18 file JavaScript được HTML công khai tham chiếu. Tìm thấy 212 đường dẫn hoặc tiền tố API sau khi bỏ query string, gồm 188 mục có method từ lời gọi HTTP trực tiếp và 497 vị trí xuất hiện. Các chuỗi tạo động có thể bị bỏ sót. Bundle có thể chứa code cũ hoặc không chạy trong giao diện hiện tại.

- `endpoint-catalog.md`: danh mục theo nhóm.
- `api-catalog.json`: method, nguồn và offset ký tự cho từng lần xuất hiện. URL và file nguồn không được lưu trong repo này.
- `request-contracts.md`: payload quan trọng đã đọc thủ công.
- `auth-flow.md`: form đăng nhập, verify và QR.
- `realtime-and-optimization.md`: STOMP, subscription và đề xuất tối ưu.

## Xác thực

Frontend gọi `GET /api/auth/verify` với header `Authorization: Bearer <token>`. Token được lấy từ localStorage với tên `userToken`.

Frontend đọc các trường trong `response.data`: `accessToken`, `loginV2Token`, `ctoken`, `user`, `sessionId`. Axios interceptor trả `response.data`, nên cần kiểm tra envelope thực tế trước khi định nghĩa kiểu dữ liệu.

Khi verify thất bại, một nhánh xử lý chuyển tới `https://<login-host>/login?target=<target>`. HTML trang này có form `POST /login?target=<target>`, với các input `username`, `password`, `targetUrl`. Chưa kiểm chứng đăng nhập thành công, cookie, chuyển hướng, cơ chế bàn giao token, MFA hoặc CAPTCHA nếu có.

Frontend có logic kích hoạt xác minh lại khi gần thời điểm hết hạn token. Chưa đủ bằng chứng để khẳng định verify luôn gia hạn phiên hoặc có thể dùng làm refresh token độc lập.

## Danh mục ban đầu

| Method | Endpoint | Bằng chứng | Còn cần xác minh |
| --- | --- | --- | --- |
| GET | `/api/auth/verify` | Lời gọi trực tiếp trong frontend | Envelope, lỗi, cookie, vòng đời token |
| GET | `/api/account/getAll` | Lời gọi trực tiếp trong frontend | Schema, phạm vi tài khoản và quyền |
| GET | `/api/account` | Lời gọi trực tiếp trong frontend | Khác biệt với `getAll` |
| POST | `/api/conversation` | Lời gọi trực tiếp, cursor `lastMessageTime` | Schema thực tế, biên cursor, quyền |
| POST | `/api/message/filter` | Lời gọi trực tiếp, cursor `timestamp` | Schema thực tế, thứ tự và biên cursor |
| Chưa xác định | `/api/message/getProfileInfo` | Chuỗi endpoint trong frontend | Method và schema |
| Chưa xác định | `/api/conversation/groupMember` | Chuỗi endpoint trong frontend | Method, schema và phân trang |

Frontend gọi `initWebsocket` sau khi lấy danh sách tài khoản. Mã cho thấy STOMP dùng SockJS tại `https://<workspace-host>/websocket`, reconnect delay 3000 ms và heartbeat hai chiều 4000 ms. Có subscription `/session/{sessionId}`, `/user/{swUsername}`, `/chat/{accountId}`. Chưa kiểm chứng handshake có xác thực hoặc nhận sự kiện thật.

## Request không xác thực đã quan sát

Hai request GET không gửi credential, không dùng phiên người dùng:

| Request | Kết quả ngày 29/10/2026 | Giới hạn kết luận |
| --- | --- | --- |
| `/api/auth/verify` | HTTP 500, JSON có `status: "error"`, `error.message: "Something wrong was happened."` | Chỉ là kết quả khi không gửi token/cookie. Không suy ra hành vi khi token hết hạn |
| `/websocket/info` | HTTP 200, `cookie_needed: true`, `websocket: true`, `origins: ["*:*"]` | Xác nhận SockJS info hoạt động. Chưa chứng minh subscription hoặc quyền nhận dữ liệu |

## Nguyên tắc ghi nhận

Mỗi API bổ sung cần có method, URL, input, output đã che dữ liệu, lỗi quan sát được và nguồn bằng chứng. Phân biệt rõ kết quả đọc mã với kết quả thử request thực tế. Đã có bằng chứng frontend gọi API gửi tin, nhưng chưa thực hiện thao tác gửi thật.
