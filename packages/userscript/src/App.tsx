import { useEffect, useState } from "react";
import {
  Button,
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogTrigger,
} from "@tomomai/ui";
import {
  clearStoredToken,
  fetchMe,
  getStoredToken,
  getValidAccessToken,
  MeData,
  openLoginPopup,
  setStoredToken,
} from "./auth";

type Props = { container: HTMLElement };

export default function App({ container: _container }: Props) {
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<MeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getStoredToken()) {
      setLoading(false);
      return;
    }
    getValidAccessToken()
      .then(fetchMe)
      .then(setUser)
      .catch(() => clearStoredToken())
      .finally(() => setLoading(false));
  }, []);

  async function handleLogin() {
    setLoginLoading(true);
    setError(null);
    try {
      const result = await openLoginPopup();
      setStoredToken(result.access_token, result.refresh_token, result.expires_in);
      const me = await fetchMe(result.access_token);
      setUser(me);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown error";
      if (msg !== "popup closed") setError(msg);
    } finally {
      setLoginLoading(false);
    }
  }

  function handleLogout() {
    clearStoredToken();
    setUser(null);
  }

  return (
    <div className="fixed bottom-4 right-4 z-[9999]">
      {/* inline renders overlay + content in the JSX tree instead of portalling
          to document.body, so shadow DOM CSS vars remain in scope */}
      <ResponsiveDialog open={open} onOpenChange={setOpen} inline>
        <ResponsiveDialogTrigger asChild>
          <Button variant="default" size="sm">
            tomomai
          </Button>
        </ResponsiveDialogTrigger>
        <ResponsiveDialogContent className="w-full">
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>tomomai</ResponsiveDialogTitle>
          </ResponsiveDialogHeader>

          {loading ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Loading…
            </div>
          ) : user ? (
            <LoggedIn user={user} onLogout={handleLogout} />
          ) : (
            <LoggedOut
              loading={loginLoading}
              error={error}
              onLogin={handleLogin}
            />
          )}
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </div>
  );
}

function LoggedIn({ user, onLogout }: { user: MeData; onLogout: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="size-10 rounded-full bg-muted flex items-center justify-center text-lg font-semibold select-none">
          {user.username.charAt(0).toUpperCase()}
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold leading-tight">{user.username}</span>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium bg-secondary text-secondary-foreground">
              {user.region}
            </span>
            {user.role !== "user" && (
              <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium bg-primary text-primary-foreground">
                {user.role}
              </span>
            )}
          </div>
        </div>
      </div>
      <Button variant="outline" size="sm" className="w-full" onClick={onLogout}>
        Log out
      </Button>
    </div>
  );
}

function LoggedOut({
  loading,
  error,
  onLogin,
}: {
  loading: boolean;
  error: string | null;
  onLogin: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Log in to your tomomai account to see your stats and scores.
      </p>
      {error && (
        <p className="text-sm text-destructive">Login failed: {error}</p>
      )}
      <Button className="w-full" disabled={loading} onClick={onLogin}>
        {loading ? "Opening…" : "Login with tomomai"}
      </Button>
    </div>
  );
}
