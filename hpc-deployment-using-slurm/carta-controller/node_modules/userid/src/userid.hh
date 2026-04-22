// This code is PUBLIC DOMAIN, and is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND.

#include <napi.h>

namespace userid
{
using namespace Napi;

String GroupName(const CallbackInfo &info);
Array Gids(const CallbackInfo &info);
Number Gid(const CallbackInfo &info);
String UserName(const CallbackInfo &info);
Object Ids(const CallbackInfo &info);
} // namespace userid
