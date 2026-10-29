# Đăng nhập và quản lý phiên

Khảo sát ngày 29/10/2026. Chỉ đọc frontend và thử hai GET không xác thực được ghi ở `api-inventory.md`. Không gửi username/password, không tạo QR, không liên kết tài khoản.

## Hai lớp phiên

1. Phiên nhà cung cấp cho phép truy cập hệ thống và các tài khoản được phân quyền.
2. Kết nối tài khoản Zalo do nhà cung cấp quản lý. Liên kết bằng QR là một luồng riêng, sau khi có quyền dùng nền tảng.

Không đánh đồng đăng nhập nền tảng với đăng nhập Zalo trực tiếp như trong `zca-js`.

## Form đăng nhập của nhà cung cấp

Nguồn: trang đăng nhập công khai của nhà cung cấp.

HTML có form action `/login?target=zalo`, method `post`, không thấy `enctype` riêng trên form. Theo cách submit form mặc định của trình duyệt, request dự kiến dùng `application/x-www-form-urlencoded`.

| Field | Nguồn giá trị |
| --- | --- |
| `username` | Tên đăng nhập hoặc email do người dùng nhập |
| `password` | Mật khẩu do người dùng nhập |
| `targetUrl` | Input hidden, giá trị `https://<workspace-host>` |

Trong HTML khảo sát, form này không có input CSRF hiển thị. Điều đó không đủ kết luận server không kiểm tra CSRF, cookie, Origin hoặc cơ chế chống tự động hóa.

Chưa xác định response đăng nhập thành công, chuỗi redirect, cookie nào cần giữ và cách phiên đăng nhập chuyển sang token của ứng dụng Zalo. Vì vậy chưa thể viết `login(username, password)` rồi khẳng định hoạt động.

## Verify phiên

Nguồn: `app.1446406d.js`, các đoạn `verifyToken`, `updateToken`, `fetchDataLocal` và Axios interceptor.

- `GET https://<workspace-host>/api/auth/verify`.
- Axios interceptor gắn `Authorization: Bearer <userToken>` từ localStorage.
- Nếu chưa có giá trị localStorage, phép nối chuỗi trong frontend có thể tạo `Bearer null`. Không nên sao chép hành vi này vào SDK.
- Frontend đọc `data.accessToken`, `data.loginV2Token`, `data.ctoken`, `data.user`, `data.sessionId`.
- Các trường quyền và gói dịch vụ cũng được đọc: `permissions`, `shopLimit`, `staffLimit`, `showAllContact`, `manageTags`, `manageAccounts`.
- Trước các request khác, frontend kích hoạt `Reverify` khi thời gian hết hạn token trừ 1 giờ đã qua. Đây là logic kích hoạt ở frontend, chưa chứng minh endpoint luôn gia hạn token.

Khi thử GET không token/cookie, server trả HTTP 500 với envelope lỗi. SDK sau này cần xử lý cả HTTP status và envelope, không mặc định lỗi xác thực luôn là 401.

## Liên kết Zalo bằng QR

Nguồn: `chunk-dd009e18.12a2b968.js`.

| Bước | Request frontend | Input |
| --- | --- | --- |
| Tạo QR | `GET /api/zalo/getQRCode` | Header `x-ssid`, query `accountId` |
| Chờ quét | `GET /api/zalo/checkQRScanned` | Cùng header `x-ssid`, query `code` |
| Chờ xác nhận | `GET /api/zalo/checkQRVerified` | Cùng header `x-ssid`, query `code` |

Component tự tạo `sessionId` qua helper, dùng làm `x-ssid`. Chưa kiểm tra helper này có quan hệ với `sessionId` từ verify hay không, không nên mặc định hai giá trị giống nhau.

Frontend đọc `data.code`, `data.image` từ phản hồi QR. Khi `checkQRScanned` còn trả `image`, frontend gọi lại bước chờ quét. Nếu không còn `image`, frontend lưu thông tin tài khoản rồi chờ xác nhận. Sau thành công, frontend tải lại danh sách tài khoản.

UI hiển thị hết hạn sau 60 giây. Đây là timer của giao diện, chưa phải TTL được backend xác nhận. Các GET này tạo hoặc tiến triển luồng liên kết, không nên coi là request chỉ đọc chỉ vì method là GET.

## Luồng loginZaloV2

Nguồn: `Setting.c037872a.js`, `AccountManagement.dd03364f.js`, `app.1446406d.js`.

Frontend tạo URL dạng `/loginZaloV2?&cToken=<loginV2Token>`. Ở route này, ứng dụng đọc `cToken` từ query và chuyển sang luồng riêng. Không đưa URL có token thật vào log, Git hoặc tài liệu. Cần khảo sát riêng trước khi dùng luồng này làm cơ chế đăng nhập SDK.

## Bước xác minh tiếp theo

Quan sát một lần đăng nhập hợp lệ trong trình duyệt bằng tài khoản được phép sử dụng. Cần ghi method, URL, status, tên cookie và các bước redirect, với giá trị credential/token được che. Sau đó đối chiếu verify và một request lấy tài khoản trước khi triển khai quản lý phiên.
