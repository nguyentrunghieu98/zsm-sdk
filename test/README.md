# Kiểm thử

Test dùng `node:test` và một `fetch` giả, không gọi mạng, không cần credential hay phiên thật.

```sh
npm test
```

Phạm vi hiện tại:

- Luồng đăng nhập: GET form → POST form → nhận cookie → verify → nhận access token.
- Sai mật khẩu trả `InvalidCredentialsError`, không gọi verify, không lộ mật khẩu trong message.
- Verify fallback khi frontend gửi `Bearer null`.
- Cookie jar: domain cookie dùng được cho subdomain, `Max-Age=0` xóa cookie.
- Chuẩn hóa danh sách tài khoản.
- Tìm khách theo SĐT, chuẩn hóa `0xxx` → `+84xxx`.
- Trạng thái lời mời, gửi lời mời một lần, mapping mã 222.
- Gửi tin nhắn, lỗi HTTP và lỗi envelope.

Fixture trong test là dữ liệu giả. Không thêm SĐT, tên khách hoặc token thật vào đây.
