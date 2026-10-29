# Danh mục endpoint từ frontend công khai

Ngày khảo sát: 29/10/2026. Đây là danh mục tĩnh, chưa gọi API có xác thực.

Tổng cộng **212 đường dẫn hoặc tiền tố đường dẫn** sau khi bỏ query string. Method chỉ ghi khi thấy lời gọi HTTP trực tiếp. Chuỗi động có thể bị bỏ sót. Mã frontend có thể chứa luồng cũ hoặc không còn chạy.

URL nguồn và SHA-256 không được lưu trong repo này. `api-catalog.json` lưu mọi vị trí xuất hiện, offset ký tự bắt đầu từ 0 và method theo từng vị trí. Không lưu nội dung cookie, token hoặc bản ghi phiên.

| Nhóm | Method quan sát được | Đường dẫn / tiền tố |
| --- | --- | --- |
| account | GET | `/api/account` |
| account | GET | `/api/account/autoConnect` |
| account | GET | `/api/account/backOffice` |
| account | DELETE | `/api/account/delete` |
| account | GET | `/api/account/getAll` |
| account | GET | `/api/account/getFriendList` |
| account | PUT | `/api/account/off` |
| account | GET | `/api/account/save` |
| account | GET | `/api/account/setting/get` |
| account | POST | `/api/account/setting/save` |
| ai | GET | `/api/ai/config` |
| ai | POST | `/api/ai/execute` |
| auth | GET | `/api/auth/verify` |
| characterFilter | DELETE, GET, POST, PUT | `/api/characterFilter` |
| characterFilter | GET | `/api/characterFilter/all` |
| cloud | GET | `/api/cloud/findByAccountId` |
| cloud | POST | `/api/cloud/save` |
| cloud | GET | `/api/cloud/setting` |
| contact | GET | `/api/contact/acceptRequest` |
| contact | GET | `/api/contact/addFriend` |
| contact | POST | `/api/contact/addSwContact` |
| contact | POST | `/api/contact/aliasV2` |
| contact | POST | `/api/contact/countFriend` |
| contact | GET, POST | `/api/contact/filter` |
| contact | GET | `/api/contact/friendship` |
| contact | GET | `/api/contact/getAliasByAccountId` |
| contact | GET | `/api/contact/recommendFriend` |
| contact | GET | `/api/contact/rejectRequest` |
| contact | POST | `/api/contact/removeFriend` |
| contact | GET | `/api/contact/requestedFriends` |
| contact | GET | `/api/contact/swContact` |
| contact | GET | `/api/contact/undoFriendRequest` |
| conversation | POST | `/api/conversation` |
| conversation | POST | `/api/conversation/addAdminMemberGr` |
| conversation | POST | `/api/conversation/all` |
| conversation | POST | `/api/conversation/changeOwnerGr` |
| conversation | POST | `/api/conversation/createGroup` |
| conversation | POST | `/api/conversation/disperseGroup` |
| conversation | POST | `/api/conversation/friendRequestStatus` |
| conversation | GET | `/api/conversation/getAiAnalysis` |
| conversation | GET | `/api/conversation/getAllGroupId` |
| conversation | POST | `/api/conversation/getCommonGroup` |
| conversation | POST | `/api/conversation/getGroupByMember` |
| conversation | GET | `/api/conversation/getOne` |
| conversation | GET | `/api/conversation/getOneByPer` |
| conversation | POST | `/api/conversation/groupLink` |
| conversation | POST | `/api/conversation/groupMember` |
| conversation | GET | `/api/conversation/hidden` |
| conversation | POST | `/api/conversation/inviteMembers` |
| conversation | GET | `/api/conversation/leaveGroup` |
| conversation | GET | `/api/conversation/pin` |
| conversation | POST | `/api/conversation/pin/save` |
| conversation | POST | `/api/conversation/pinMsgList` |
| conversation | GET | `/api/conversation/pointConversations` |
| conversation | GET | `/api/conversation/pushNotify` |
| conversation | GET | `/api/conversation/pushToAnalysis` |
| conversation | GET | `/api/conversation/read` |
| conversation | POST | `/api/conversation/removeAdminMemberGr` |
| conversation | GET | `/api/conversation/removeGroupMember` |
| conversation | GET | `/api/conversation/search` |
| conversation | GET, POST | `/api/conversation/setSwName` |
| conversation | POST | `/api/conversation/tag` |
| conversation | POST | `/api/conversation/typing` |
| conversation | GET | `/api/conversation/unread` |
| conversationV2 | POST | `/api/conversationV2/allV2` |
| conversationV2 | POST | `/api/conversationV2/count-by-type` |
| customer-info | GET, POST | `/api/customer-info` |
| employee | GET | `/api/employee/active` |
| employee | GET | `/api/employee/all` |
| employee | GET | `/api/employee/getAllUsername` |
| employee | GET | `/api/employee/option1` |
| employee | POST | `/api/employee/save` |
| file | POST | `/api/file` |
| folder | GET, POST | `/api/folder` |
| hub | GET | `/api/hub/cloudSubscription` |
| hub | GET | `/api/hub/getReplaceUrl` |
| hub | Chưa xác định | `/api/hub/saveImageByClient` |
| image | GET | `/api/image` |
| image | GET | `/api/image/` |
| image | GET | `/api/image/file` |
| image | POST | `/api/image/upload` |
| log | POST | `/api/log` |
| message | POST | `/api/message/block` |
| message | POST | `/api/message/crawl` |
| message | POST | `/api/message/createGroupTopic` |
| message | POST | `/api/message/createTopic` |
| message | POST | `/api/message/delete` |
| message | GET | `/api/message/draft` |
| message | POST | `/api/message/filter` |
| message | Chưa xác định | `/api/message/filterFile` |
| message | Chưa xác định | `/api/message/filterLink` |
| message | Chưa xác định | `/api/message/filterMedia` |
| message | POST | `/api/message/forwardMessage` |
| message | GET | `/api/message/getGroupInfoByLink` |
| message | GET | `/api/message/getProfileInfo` |
| message | POST | `/api/message/group/mention` |
| message | GET | `/api/message/groupInfoV2` |
| message | POST | `/api/message/groupMsg` |
| message | POST | `/api/message/groupSticker` |
| message | GET | `/api/message/joinGroupFromLink` |
| message | GET | `/api/message/onlineStatus` |
| message | POST | `/api/message/parseLink` |
| message | POST | `/api/message/pendingMemsGroup` |
| message | POST | `/api/message/pin` |
| message | GET | `/api/message/pollDetail` |
| message | POST | `/api/message/removeTopic` |
| message | Chưa xác định | `/api/message/replyGroupMessage` |
| message | Chưa xác định | `/api/message/replyMessage` |
| message | Chưa xác định | `/api/message/replyPhoto` |
| message | POST | `/api/message/reviewJoinGroup` |
| message | POST | `/api/message/search` |
| message | Chưa xác định | `/api/message/searchInConversation` |
| message | Chưa xác định | `/api/message/searchInGroup` |
| message | POST | `/api/message/sendContact` |
| message | POST | `/api/message/sendFileFromLibrary` |
| message | POST | `/api/message/sendGroupMsgPhoto` |
| message | POST | `/api/message/sendLink` |
| message | POST | `/api/message/sendMsgFile` |
| message | POST | `/api/message/sendMsgPhoto` |
| message | GET | `/api/message/sendPhoto` |
| message | POST | `/api/message/sendReaction` |
| message | POST | `/api/message/sms` |
| message | POST | `/api/message/sticker` |
| message | POST | `/api/message/sticker/full` |
| message | POST | `/api/message/undo` |
| message | POST | `/api/message/unpin` |
| message | POST | `/api/message/updateDraft` |
| message | Chưa xác định | `/api/message/updateGroupTopic` |
| message | Chưa xác định | `/api/message/updateTopic` |
| messageV2 | POST | `/api/messageV2/filter` |
| messageV2 | POST | `/api/messageV2/friendRequestStatus` |
| messageV2 | POST | `/api/messageV2/getConversationInfo` |
| messageV2 | POST | `/api/messageV2/getProfileInfo` |
| messageV2 | POST | `/api/messageV2/onlineStatus` |
| messageV2 | POST | `/api/messageV2/pinMsgList` |
| payment | POST | `/api/payment/createDebt` |
| payment | GET | `/api/payment/genQR` |
| payment | POST | `/api/payment/getDebtDetails` |
| payment | GET | `/api/payment/getDebtHistory` |
| payment | GET | `/api/payment/getMerchantList` |
| quickMessageConfig | GET | `/api/quickMessageConfig` |
| quickMessageConfig | GET | `/api/quickMessageConfig/allByCurrentUser` |
| quickMessageConfig | POST | `/api/quickMessageConfig/save` |
| quickMessageConfig | POST | `/api/quickMessageConfig/saveMultiple` |
| quickMessageConfig | PUT | `/api/quickMessageConfig/update` |
| search | GET | `/api/search/byPhone` |
| search | GET | `/api/search/getProfileInfo` |
| search | GET | `/api/search/searchByPhoneAndAccount` |
| search | POST | `/api/search/searchNewContact` |
| statistic | Chưa xác định | `/api/statistic` |
| statistic | GET | `/api/statistic/exportMessageById` |
| statistic | POST | `/api/statistic/overview` |
| statistic | POST | `/api/statistic/tag` |
| stock | POST | `/api/stock/addOrder` |
| stock | GET | `/api/stock/address` |
| stock | GET | `/api/stock/customer` |
| stock | GET | `/api/stock/getInitData` |
| stock | GET | `/api/stock/getOrderByCustomerId` |
| stock | GET | `/api/stock/orders` |
| stock | POST | `/api/stock/searchProduct` |
| sw-contact | GET | `/api/sw-contact/processes` |
| sw-contact | POST | `/api/sw-contact/save` |
| sw-contact | GET | `/api/sw-contact/setting` |
| sw-contact | GET | `/api/sw-contact/storages` |
| sw-contact | POST | `/api/sw-contact/sync-imediately` |
| sync | Chưa xác định | `/api/sync/accountInfo` |
| sync | Chưa xác định | `/api/sync/accountInfo-by-accountId` |
| sync | Chưa xác định | `/api/sync/contact` |
| sync | Chưa xác định | `/api/sync/contact-by-accountId` |
| sync | POST | `/api/sync/findByAccountIdsAndType` |
| sync | Chưa xác định | `/api/sync/group` |
| sync | Chưa xác định | `/api/sync/group-by-accountId` |
| sync | Chưa xác định | `/api/sync/oldMessage` |
| sync | Chưa xác định | `/api/sync/oldMessage-by-accountId` |
| sync | POST | `/api/sync/request-sync` |
| sync | Chưa xác định | `/api/sync/tag` |
| sync | Chưa xác định | `/api/sync/tag-by-accountId` |
| tag | GET | `/api/tag` |
| tag | POST | `/api/tag/countConsByTags` |
| tag | GET | `/api/tag/delete` |
| tag | GET | `/api/tag/history` |
| tag | POST | `/api/tag/swap` |
| tag | GET | `/api/tag/tagSetting` |
| todo | POST | `/api/todo/createTodo` |
| todo | POST | `/api/todo/ding` |
| todo | POST | `/api/todo/getTodoList` |
| todo | POST | `/api/todo/reject` |
| todo | POST | `/api/todo/removeTask` |
| todo | POST | `/api/todo/status` |
| user | GET | `/api/user/employee` |
| user | POST | `/api/user/employee/authorization` |
| user | GET | `/api/user/employee/byAccount` |
| user | POST | `/api/user/saveIpWhiteList` |
| user | GET | `/api/user/search` |
| user | GET | `/api/user/termAccept` |
| v2 | POST | `/api/v2/customer/config` |
| v2 | GET | `/api/v2/customer/getCode` |
| v2 | GET | `/api/v2/customer/getInfo` |
| v2 | POST | `/api/v2/customer/save` |
| v2 | DELETE, GET | `/api/v2/folder` |
| v2 | Chưa xác định | `/api/v2/folder/change` |
| v2 | DELETE, GET, POST | `/api/v2/image` |
| v2 | GET | `/api/v2/image/` |
| v2 | Chưa xác định | `/api/v2/image/addToFolder` |
| v2 | PUT | `/api/v2/image/change` |
| v2 | POST | `/api/v2/tag/merge` |
| v2 | POST | `/api/v2/tag/save` |
| v2 | GET | `/api/v2/tag/tagSetting` |
| v2 | PUT | `/api/v2/tag/update` |
| zalo | GET | `/api/zalo/checkQRScanned` |
| zalo | GET | `/api/zalo/checkQRVerified` |
| zalo | GET | `/api/zalo/getQRCode` |
