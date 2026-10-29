# Request quan trọng đọc từ frontend

Khảo sát ngày 29/10/2026. Những field dưới đây xuất hiện ở các caller cụ thể, chưa chứng minh được toàn bộ field bắt buộc, kiểu dữ liệu, mặc định hoặc quyền server. Không thực hiện thao tác nghiệp vụ thật.

Nguồn chính:

- `app.1446406d.js`
- `Setting.c037872a.js`
- `Setting~ShoppeAccount.c84beaae.js`
- `ShoppeAccount.4cb5bd1c.js`
- `chunk-2293628a.e06ed5da.js`
- `chunk-dd009e18.12a2b968.js`

URL nguồn không được lưu trong repo này. Vị trí endpoint trong mã nằm trong `api-catalog.json`.

## Tài khoản, liên hệ và tìm kiếm

| Method | Endpoint | Input quan sát được |
| --- | --- | --- |
| GET | `/api/account/getAll` | Không thấy payload ở caller |
| GET | `/api/account` | Không thấy payload ở caller |
| GET | `/api/contact/filter` | Query `searchKey`, `accountId`, `page`, `pageSize` |
| GET | `/api/contact/requestedFriends` | Query `accountId` |
| GET | `/api/contact/recommendFriend` | Query `accountId` |
| GET | `/api/search/byPhone` | Query `searchKey` |
| GET | `/api/search/searchByPhoneAndAccount` | Query `searchKey`, `accountId` |
| POST | `/api/search/searchNewContact` | JSON `searchKey`, `accountId` |
| POST | `/api/messageV2/getProfileInfo` | JSON `accountId`, `toId`, `group`, `page` |

Frontend đổi số bắt đầu bằng `0` thành `+84` trong một số luồng tìm kiếm. Đây là xử lý dành cho số Việt Nam trong caller, chưa phải quy tắc chuẩn hóa mọi số điện thoại của API.

`contact/filter` được đọc dưới dạng `data.content`, có caller dùng `page: 0` và `pageSize: 10000`. Không nên coi 10000 là giới hạn an toàn hoặc giới hạn server.

Một số caller profile có nhánh parse JSON khi `data` là string. Cần xác minh kiểu phản hồi trước khi chốt type TypeScript.

## Lời mời và bạn bè

| Method | Endpoint | Input quan sát được |
| --- | --- | --- |
| GET | `/api/contact/addFriend` | Query `accountId`, `userId`, một số caller có `msg` |
| GET | `/api/contact/undoFriendRequest` | Query `accountId`, `userId` |
| GET | `/api/contact/acceptRequest` | Query `accountId`, `userId` |
| GET | `/api/contact/rejectRequest` | Query `accountId`, `userId` |
| POST | `/api/contact/removeFriend` | JSON `accountId`, `friendId` |
| POST | `/api/conversation/friendRequestStatus` | JSON `accountId`, `friendId` |
| POST | `/api/messageV2/friendRequestStatus` | JSON `accountId`, `toId`, `group`, `page` |
| POST | `/api/message/block` | JSON `accountId`, `friendId`, `action`, một số caller có `conversationId` |

`action` trong caller block là `block` hoặc `unblock`. Các GET lời mời làm thay đổi trạng thái. SDK không được tự động retry chúng theo chính sách dành cho request chỉ đọc.

Một số caller kiểm tra `data.error_code === 0`, đọc `data.error_message` và dữ liệu lồng trong `data.data`. Với addFriend, frontend có nhánh mã 222 đánh dấu đã là bạn và kiểm tra `is_requested` sau lời mời. Chưa có response thật để xác nhận toàn bộ bảng mã lỗi.

## Hội thoại và phân trang

### `POST /api/conversation`

Payload frontend:

```json
{
  "isGroup": null,
  "unread": false,
  "unReplied": null,
  "searchKey": "",
  "accountIds": [],
  "lastMessageTime": 0,
  "selectedTags": [],
  "dateRange": [],
  "pageSize": 40
}
```

Đây là hình dạng minh họa theo các field của caller. `pageSize: 40` chỉ là giá trị minh họa, chưa xác định PAGE_SIZE của caller này hoặc default server. Khi tải thêm, frontend lấy `lastMessageTime` từ hội thoại cuối. Phản hồi được xử lý như một mảng `data`.

### `POST /api/conversation/all` và `POST /api/conversationV2/allV2`

Caller gửi `accountId`, `searchKey`, `selectedTags`, `page`, `pageSize`, `type`. Phản hồi được đọc qua `data.totalElements` và `data.content`. Đây là cơ chế phân trang khác với `/api/conversation`, không thay thế trực tiếp cho nhau.

`POST /api/conversationV2/count-by-type` dùng các field tương tự, đọc `data.all`, `data.personal`, `data.group`, `data.hidden`, `data.page`.

## Tin nhắn

| Method | Endpoint | Payload quan sát được |
| --- | --- | --- |
| POST | `/api/message/sms` | `accountId`, `toId`, `message`. Caller màn hình chat thêm `conversationId`, `bannedKeyword`, `replace` |
| POST | `/api/message/groupMsg` | `accountId`, `groupId`, `message`. Một số caller thêm field khác |
| POST | `/api/message/filter` | `conversationId`, `accountId`, `timestamp`, `pageSize`, một số caller có `msgTypes` |
| POST | `/api/messageV2/filter` | `conversationId`, `accountId`, `timestamp`, `msgTypes`, `pageSize` |
| POST | `/api/message/undo` | `accountId`, `toId`, `group`, `msgId`, `cliMsgIdUndo` |
| POST | `/api/message/delete` | `accountId`, `toId`, `group`, `cliMsgId`, `globalMsgId`, `ownerId`, `destId` |
| POST | `/api/message/sendReaction` | `accountId`, `toId`, `msgType`, `clientMsgId`, `globalMsgId`, `reactionIcon`, `reactionType`, `group` |

`sms` ở đây được frontend dùng gửi tin chat cá nhân. Tên route không chứng minh đó là tin SMS của nhà mạng.

Lịch sử `/api/message/filter` dùng cursor `timestamp`. Caller cập nhật cursor từ `ts`, có bước reverse trước khi thêm vào danh sách hiển thị. Cần kiểm chứng thứ tự phản hồi và biên cursor để tránh lặp hoặc thiếu tin nhắn.

`messageV2/filter` có caller không đọc kết quả HTTP, và có handler nhận sự kiện `filterMessageTab`. Đây là bằng chứng gợi ý một số luồng trả dữ liệu qua realtime, cần kiểm chứng correlation request/event. Không mặc định mọi API V2 đều hoạt động như vậy.

Frontend chặn thao tác thu hồi khi tuổi tin nhắn lớn hơn 24 giờ. Đây là giới hạn UI quan sát được, chưa kiểm tra quy định backend hoặc nền tảng hiện hành.

### File và ảnh

`POST /api/message/sendMsgFile` dùng FormData với `conversationId`, `file`, `accountId`, `toId`, `isGroup`.

`POST /api/message/sendMsgPhoto?groupId=...&totalItems=...&idInGroup=...` dùng FormData với `conversationId`, `file`, `accountId`, `toId`, có caller thêm `id`. `groupId` ở query này được caller dùng cho gom nhiều ảnh, không được tự suy ra đó là ID nhóm chat.

Có route gửi ảnh nhóm riêng `/api/message/sendGroupMsgPhoto`. Chưa tổng hợp đủ payload cho route này.

### Reply tin nhắn cá nhân

Caller dùng route động `/api/message/replyMessage` hoặc `/api/message/replyPhoto`, rồi gọi POST qua biến. Payload chung: `conversationId`, `toId`, `accountId`, `message`, `ownerId`, `replyMsgId`, `replyMsgClientId`, `replyMsgTs`. Caller thêm `replyMsg` hoặc `replyMsgAttach` tùy loại tin.

Do route truyền qua biến, bộ trích danh mục tự động có thể không gắn được method ở mọi vị trí. Phần này đã đọc thủ công.

## Nhóm và đồng bộ

| Method | Endpoint | Payload quan sát được |
| --- | --- | --- |
| POST | `/api/conversation/createGroup` | `groupName`, `accountId`, `membersId` |
| POST | `/api/conversation/inviteMembers` | `groupId`, `accountId`, `membersId` |
| POST | `/api/sync/request-sync` | `accountIds`, `syncType` |
| PUT | `/api/account/off?accountId=...` | Query `accountId`, ngắt kết nối tài khoản |

Tạo nhóm có nhánh xử lý error_code 270 trong frontend. Không giả định giới hạn tạo nhóm cụ thể khi chưa có response thật. Đồng bộ được UI mô tả là tác vụ có thể mất vài phút, HTTP thành công chưa chứng minh dữ liệu đã đồng bộ xong.
