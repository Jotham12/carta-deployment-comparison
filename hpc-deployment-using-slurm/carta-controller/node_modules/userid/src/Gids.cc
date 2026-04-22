// This code is PUBLIC DOMAIN, and is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND.

#include "userid.hh"

#if !defined(_WIN32)
#include <pwd.h>
#include <grp.h>

// BSD needs unistd.h for getgrouplist function
#if defined(BSD) || defined(__APPLE__)
#include <unistd.h>
#endif

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
 * The getpwnam() function returns a pointer to a structure containing
 * the broken-out fields of the record in the password database (e.g.,
 * the local password file /etc/passwd, NIS, and LDAP) that matches the
 * username name.
 */
struct passwd *getpwnam(const char *name);

/**
 * The getgrouplist() function scans the group database (see group(5))
 * to obtain the list of groups that user belongs to.  Up to *ngroups of
 * these groups are returned in the array groups.
 * 
 * If it was not among the groups defined for user in the group
 * database, then group is included in the list of groups returned by
 * getgrouplist(); typically this argument is specified as the group ID
 * from the password record for user.
 * 
 * The ngroups argument is a value-result argument: on return it always
 * contains the number of groups found for user, including group; this
 * value may be greater than the number of groups stored in groups.
 * 
 * @return If the number of groups of which user is a member is less than or
 * equal to *ngroups, then the value *ngroups is returned.
 * 
 * If the user is a member of more than *ngroups groups, then
 * getgrouplist() returns -1.  In this case, the value returned in
 * *ngroups can be used to resize the buffer passed to a further call
 * getgrouplist().
 */
int getgrouplist(const char *user, gid_t group,
                 gid_t *groups, int *ngroups);
#endif

using namespace Napi;

Array userid::Gids(const CallbackInfo &info)
{
  auto env = info.Env();

  if (info.Length() < 1)
  {
    TypeError::New(env, "Wrong number of arguments").ThrowAsJavaScriptException();
    return Array::New(env, 0);
  }

  if (!info[0].IsString())
  {
    TypeError::New(env, "Argument must be a string").ThrowAsJavaScriptException();
    return Array::New(env, 0);
  }

  auto username = std::string(info[0].As<String>()).c_str();

  errno = 0;
  auto pw = getpwnam(username);

  if (!pw)
  {
    // TODO: More verbose error message that includes errno
    Error::New(env, "getpwnam").ThrowAsJavaScriptException();
    return Array::New(env, 0);
  }

#ifdef __APPLE__
  typedef int gidType;
#else  // ifdef __APPLE__
  typedef gid_t gidType;
#endif // ifdef __APPLE__

  gidType *groups = nullptr;

  int foundGroups;
  int ngroups = 4;

  do
  {
    // It is safe to delete nullptr on first run
    delete[] groups;

    // Make our list of groups bigger by 4 at a time
    ngroups *= 2;

    groups = new gidType[ngroups];

    if (!groups)
    {
      Error::New(env, "Malloc error generating list of groups").ThrowAsJavaScriptException();
      return Array::New(env, 0);
    }

    foundGroups = getgrouplist(username, pw->pw_gid, groups, &ngroups);

    // getgrouplist forces us to guess how many groups the user might be in
    // returns `-1` if we guessed too low
  } while (foundGroups == -1);

  auto ret = Array::New(env, foundGroups);

  for (int i = 0; i < ngroups; i++)
  {
    // TODO: What happens when `napi_value`s are assigned to an array? Do their allocations need to stay around?
    ret[uint32_t(i)] = Number::New(env, groups[i]);
  }

  delete[] groups;

  return ret;
}
