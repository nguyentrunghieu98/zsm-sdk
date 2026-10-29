# Lộ trình triển khai

## 1. Xác định luồng đăng nhập và phiên

- Đã xác định form username/password công khai, ghi tại `auth-flow.md`.
- Tiếp theo: quan sát đăng nhập trên tài khoản người dùng có quyền sử dụng.
- Xác minh request đăng nhập thực tế, redirect, token và cookie cần thiết.
- Xác minh `GET /api/auth/verify`, response và tình huống hết phiên.
- Chốt cách SDK nhận và lưu phiên trước khi thiết kế public API.

## 2. Bản SDK đầu tiên

- HTTP client dùng fetch, xử lý timeout và lỗi có che thông tin xác thực.
- Xác minh phiên và lấy danh sách tài khoản.
- Kiểm thử bằng fixture đã che dữ liệu và HTTP mock.
- Ví dụ chạy local sử dụng biến môi trường.

## 3. Hội thoại, tin nhắn và sự kiện

- Đã ghi nhận caller cho hội thoại, lịch sử tin nhắn và phân trang tại `request-contracts.md`, cần kiểm chứng bằng phiên hợp lệ.
- Xác minh gửi tin nhắn với người nhận thử nghiệm được chỉ định.
- Đã xác định cấu hình STOMP qua SockJS và các subscription tại `realtime-and-optimization.md`, cần kiểm chứng handshake, reconnect và đồng bộ sau mất kết nối.
- Chỉ tự động retry thao tác ghi khi đã xác định cách tránh gửi trùng.

## 4. Tối ưu luồng và tích hợp Zalo Manager

- Đo số request và độ trễ của luồng hiện tại để có mốc so sánh.
- Giảm request trùng, giới hạn đồng thời và xử lý rate limit theo bằng chứng thực tế.
- Tích hợp SDK vào n8n bằng adapter sau khi hợp đồng SDK ổn định.

Tên phương thức và cấu trúc class sẽ chốt sau khảo sát. Trải nghiệm có thể gần `zca-js` nhưng không mặc định nhà cung cấp có cùng khả năng hoặc cùng cách đăng nhập.
