// This code is PUBLIC DOMAIN, and is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND.

#include "userid.hh"

#if !defined(_WIN32)
#include <pwd.h>
#else
// Mocks for Windows

typedef uint32_t uid_t;
typedef uint32_t gid_t;
struct passwd
{
  char *pw_name;   /* username */
  char *pw_passwd; /* user password */
  uid_t pw_uid;    /* user ID */
  gid_t pw_gid;    /* group ID */
  char *pw_gecos;  /* user information */
  char *pw_dir;    /* home directory */
  char *pw_shell;  /* shell program */
};

/**
 * The getpwuid() function returns a pointer to a structure containing the broken-out fields of the record in the password database that matches the user ID uid.
 */
struct passwd *getpwuid(uid_t uid);
#endif

using namespace Napi;
using namespace userid;

String userid::UserName(const CallbackInfo &info)
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

  auto user = getpwuid(info[0].As<Number>().Int32Value());

  if (!user)
  {
    Error::New(env, "uid not found").ThrowAsJavaScriptException();
    return String::New(env, "");
  }

  return String::New(env, user->pw_name);
}
