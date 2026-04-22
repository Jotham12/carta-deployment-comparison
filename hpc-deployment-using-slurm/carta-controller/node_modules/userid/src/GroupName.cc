// This code is PUBLIC DOMAIN, and is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND.

#include "userid.hh"

#if !defined(_WIN32)
#include <grp.h>
#else
// Mocks for Windows

typedef uint32_t gid_t;
struct group
{
  /**
   * group name
   **/
  char *gr_name;
  /**
   * group password
   **/
  char *gr_passwd;
  /**
   * group ID
   **/
  gid_t gr_gid;
  /**
   * NULL-terminated array of pointers to names of group members
   **/
  char **gr_mem;
};

/**
 * The getgrgid() function shall search the group database for an entry with a matching gid.
 */
struct group *getgrgid(gid_t gid);
#endif

using namespace Napi;
using namespace userid;

String userid::GroupName(const CallbackInfo &info)
{
  auto env = info.Env();

  if (info.Length() < 1)
  {
    TypeError::New(env, "Wrong number of arguments").ThrowAsJavaScriptException();
    return String::New(env, "");
  }

  if (!info[0].IsNumber())
  {
    TypeError::New(env, "Argument must be a number").ThrowAsJavaScriptException();
    return String::New(env, "");
  }

  int gid = info[0].As<Number>().Int32Value();

  auto group = getgrgid(gid);

  if (!group)
  {
    Error::New(env, "gid not found").ThrowAsJavaScriptException();
    return String::New(env, "");
  }

  return String::New(env, group->gr_name);
}
