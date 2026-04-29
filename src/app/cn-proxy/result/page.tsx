import { CheckCircle2, AlertTriangle, Wifi } from "lucide-react";

export const metadata = {
  title: "代理授权结果 - tomomai ともマイ",
};

interface PageProps {
  searchParams: Promise<{ type?: string }>;
}

export default async function CnProxyResultPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const isDone = params.type === "done";

  return (
    <div className="flex min-h-dvh items-center justify-center p-6 bg-background text-foreground">
      <div className="max-w-md w-full space-y-6">
        <div className="flex items-center gap-4">
          <div
            className={
              isDone
                ? "rounded-full bg-emerald-500/10 p-3 shrink-0"
                : "rounded-full bg-amber-500/10 p-3 shrink-0"
            }
          >
            {isDone ? (
              <CheckCircle2 className="h-6 w-6 text-emerald-600" />
            ) : (
              <AlertTriangle className="h-6 w-6 text-amber-600" />
            )}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {isDone ? (
              <>
                授权成功
                <span className="block text-base font-normal text-muted-foreground">
                  Authorization Successful
                </span>
              </>
            ) : (
              <>
                授权失败
                <span className="block text-base font-normal text-muted-foreground">
                  Authorization Failed
                </span>
              </>
            )}
          </h1>
        </div>

        <hr className="border-border" />

        <div className="space-y-2 text-sm leading-relaxed">
          {isDone ? (
            <>
              <p className="text-muted-foreground">
                我们已经从舞萌 DX 取得登入凭证，正在为您导入数据。请关闭此页面回到 tomomai 查看导入进度。
              </p>
              <p className="text-muted-foreground">
                Your data is being imported. You can close this tab and return to tomomai to check the progress.
              </p>
            </>
          ) : (
            <>
              <p className="text-muted-foreground">
                授权过程中出现错误。可能是链接已过期或网络问题，请关闭此页面回到 tomomai 重新生成授权链接再试一次。
              </p>
              <p className="text-muted-foreground">
                Something went wrong during authorization. The link may have expired or the connection dropped. Close this tab, return to tomomai, generate a new link, and try again.
              </p>
            </>
          )}
        </div>

        {isDone && (
          <div className="rounded-md border bg-muted/40 p-3">
            <div className="flex items-start gap-2">
              <Wifi className="h-4 w-4 mt-0.5 flex-shrink-0 text-muted-foreground" />
              <div className="space-y-1 text-sm">
                <p className="font-medium">
                  请记得关闭手机的 HTTP 代理
                  <span className="block font-normal text-muted-foreground text-xs mt-0.5">
                    Don&apos;t forget to turn the proxy off
                  </span>
                </p>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  在 Wi-Fi 设置中将 HTTP 代理改回「无」/「关闭」。本代理只允许访问授权流程相关的网站，若不关闭，您手机上的其他网页和 App 都将无法正常联网。
                </p>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  In your Wi-Fi settings, switch the HTTP proxy back to Off. The proxy only handles traffic for the authorization flow, so leaving it on will block the rest of your apps and browsing from reaching the internet.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
