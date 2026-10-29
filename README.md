# zsm-sdk

TypeScript SDK không chính thức cho một workspace quản lý **nhiều tài khoản Zalo bán hàng**:

- Đăng nhập bằng `username`/`password` của tài khoản quản trị, không cần quét QR cho từng sale.
- Lấy danh sách tài khoản Zalo mà tài khoản quản trị được phép dùng.
- Chọn một tài khoản sale để tìm khách theo số điện thoại, kiểm tra quan hệ bạn bè, gửi lời mời kết bạn và gửi tin nhắn.

> ⚠️ **Không chính thức.** Package không liên kết với nhà cung cấp workspace hoặc Zalo. API được quan sát từ frontend công khai và có thể thay đổi không báo trước. Tự động gửi lời mời hoặc tin nhắn có thể vi phạm điều khoản của nhà cung cấp và khiến tài khoản bị hạn chế. Tự chịu trách nhiệm khi dùng.

## Tính năng

- Đăng nhập bằng form `username`/`password`, đổi cookie phiên lấy access token qua endpoint `verify`.
- Tự kiểm tra lại phiên khi access token gần hết hạn (dựa trên claim `exp` nếu token là JWT).
- Liệt kê tài khoản sale kèm `accountId`, tên, avatar và trạng thái.
- Tìm khách theo số điện thoại, tự chuẩn hóa `0912345678` → `+84912345678`.
- Đọc trạng thái lời mời kết bạn và gửi lời mời từ một tài khoản sale.
- Gửi tin nhắn văn bản.
- Lỗi có kiểu rõ ràng, không chứa mật khẩu hay token trong message.

## Yêu cầu

- Node.js >= 20 (dùng `fetch`, `AbortSignal.timeout`, `Headers.getSetCookie` khi có).
- Tài khoản quản trị của workspace và một tài khoản sale đã được liên kết Zalo trong workspace.

## Cài đặt

```sh
npm install zsm-sdk
```

## Cấu hình

```sh
ZSM_BASE_URL=https://workspace.example
ZSM_LOGIN_URL=https://login.example
ZSM_USERNAME=
ZSM_PASSWORD=
```

`baseUrl` là host của workspace, `loginUrl` là host trang đăng nhập. Hai host có thể là subdomain của cùng một domain; SDK giữ cookie phiên theo đúng domain để trao đổi token.

## Bắt đầu

```ts
import { ZsmClient } from 'zsm-sdk';

const client = new ZsmClient({
  baseUrl: process.env.ZSM_BASE_URL!,
  loginUrl: process.env.ZSM_LOGIN_URL!,
});

await client.login({
  username: process.env.ZSM_USERNAME!,
  password: process.env.ZSM_PASSWORD!,
});

const accounts = await client.listAccounts();
console.log(accounts.map((account) => ({ id: account.accountId, name: account.name })));

const sale = accounts[0];
const profile = await client.findUserByPhone(sale.accountId, '0912345678');
if (profile) {
  const current = await client.getFriendRequestStatus(sale.accountId, profile.userId);
  console.log('Trạng thái hiện tại:', current.status);

  if (current.status !== 'ALREADY_FRIENDS') {
    const result = await client.sendFriendRequest(
      sale.accountId,
      profile.userId,
      'Xin chào, em là tư vấn viên của shop ạ!',
    );
    console.log('Kết quả gửi lời mời:', result.status);
  }

  await client.sendMessage({
    accountId: sale.accountId,
    toId: profile.userId,
    message: 'Dạ em chào anh/chị ạ!',
  });
}
```

## API

| Method | Mô tả |
| --- | --- |
| `login({ username, password })` | Đăng nhập và trả về `Session` (access token, session id, user, quyền). |
| `verify()` | Gọi lại endpoint verify để làm mới token và session. |
| `loginWithToken(accessToken)` | Dùng token có sẵn từ browser/credential store. |
| `useSession(session)` | Gắn lại session đã lưu trước đó. |
| `listAccounts()` | Danh sách tài khoản sale mà tài khoản quản trị được phép dùng. |
| `findUserByPhone(accountId, phone)` | Tìm khách theo SĐT; trả `null` nếu không thấy. |
| `getFriendRequestStatus(accountId, userId)` | `ALREADY_FRIENDS`, `INVITED`, `NONE`, `UNKNOWN`… |
| `sendFriendRequest(accountId, userId, message?)` | Gửi lời mời; không tự retry. |
| `sendMessage({ accountId, toId, message })` | Gửi tin nhắn văn bản. |
| `logout()` | Xóa session và cookie trong bộ nhớ. |

Mỗi object trả về đều giữ trường `raw` để đối chiếu khi schema của workspace thay đổi.

## Phiên và bảo mật

- `client.session` chứa `accessToken`, `loginV2Token`, `ctoken`, `sessionId`. Đây là thông tin đăng nhập — không ghi vào Git, log hay file công khai.
- SDK tự gọi `verify()` khi access token còn dưới 30 phút. Nếu cookie phiên không còn, SDK ném `AuthenticationError`; hãy đăng nhập lại.
- Mật khẩu chỉ được gửi trong request đăng nhập tới `loginUrl` đã cấu hình. SDK không gửi mật khẩu tới host khác.
- `sendFriendRequest` dùng GET nhưng **thay đổi trạng thái**. SDK chỉ gửi một lần, không retry; caller phải chống trùng và giới hạn tần suất.

## Lỗi

Mọi lỗi kế thừa `ZsmError`:

| Lỗi | Khi nào |
| --- | --- |
| `InvalidCredentialsError` | Sai username/password hoặc đăng nhập không tạo được phiên. |
| `AuthenticationError` | Verify thất bại, token hết hạn, phiên không hợp lệ. |
| `SessionRequiredError` | Gọi API khi chưa có session. |
| `HttpError` | Response HTTP ngoài 2xx. |
| `ApiError` | Response HTTP 200 nhưng envelope báo lỗi (`status: "error"`, `error_code != 0`). |

## Phát triển

```sh
npm ci
npm run typecheck
npm test
npm run build
```

`npm test` build TypeScript rồi chạy test bằng HTTP mock, không gọi mạng và không cần credential.

## Cấu trúc

```text
src/client.ts      ZsmClient: login, verify, account, contact, message
src/http.ts        fetch, cookie jar, redirect, timeout
src/cookies.ts     cookie jar + đọc exp của JWT
src/errors.ts      lỗi có kiểu
src/types.ts       public types
test/              test HTTP mock
docs/              tài liệu khảo sát hợp đồng API
postman/           bộ thử thủ công
```

## Mức độ kiểm chứng

Đã xác minh trực tiếp trên một workspace thật ngày 29/10/2026:

- Đăng nhập bằng `username`/`password`, đổi cookie phiên lấy access token qua endpoint verify.
- Liệt kê toàn bộ tài khoản sale, gồm cả tài khoản `ACTIVE` và `OFF`.
- Tìm khách theo số điện thoại (chỉ đọc) trả `null` khi không có hồ sơ.

Chưa chạy thử gửi lời mời kết bạn hoặc gửi tin nhắn thật trên tài khoản production. Schema phản hồi có thể khác giữa các phiên bản; các trường không ổn định được giữ nguyên trong `raw` thay vì bị che đi.

## Giấy phép

MIT.
