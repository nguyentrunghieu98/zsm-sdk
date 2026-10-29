# Ví dụ

```sh
npm run build
ZSM_BASE_URL=https://workspace.example \
ZSM_LOGIN_URL=https://login.example \
ZSM_LOGIN_TARGET=... \
ZSM_USERNAME=... \
ZSM_PASSWORD=... \
node examples/check-login.mjs
```

`check-login.mjs` chỉ in số lượng tài khoản và tên hiển thị; không in token, cookie hay mật khẩu.
