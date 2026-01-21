"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '@/server/routers/_app';
import superjson from 'superjson';
import { format } from "date-fns";
import { Copy, Check } from "lucide-react";
import { Button } from "../ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface TokenDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  adminToken: string;
  userId: string | null;
}

type Token = {
  id: string;
  region: string;
  token: string;
  createdAt: Date;
  updatedAt: Date;
};

type TokenDetails = {
  user: {
    id: string;
    username: string | null;
    email: string;
  };
  tokens: Token[];
};

export function TokenDetailsDialog({
  open,
  onOpenChange,
  adminToken,
  userId,
}: TokenDetailsDialogProps) {
  const [tokenDetails, setTokenDetails] = useState<TokenDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const adminTrpc = useMemo(
    () =>
      createTRPCClient<AppRouter>({
        links: [
          httpBatchLink({
            url: "/api/trpc",
            transformer: superjson,
            headers() {
              return {
                authorization: `Bearer ${adminToken}`,
              };
            },
          }),
        ],
      }),
    [adminToken]
  );

  const fetchTokenDetails = useCallback(async () => {
    if (!userId) return;

    setLoading(true);
    try {
      const result = await adminTrpc.admin.users.getTokenDetails.query({
        userId,
      });
      setTokenDetails(result as TokenDetails);
    } catch (error) {
      console.error("Failed to fetch token details:", error);
    } finally {
      setLoading(false);
    }
  }, [adminTrpc, userId]);

  useEffect(() => {
    if (open && userId) {
      fetchTokenDetails();
    }
  }, [open, userId, fetchTokenDetails]);

  const copyToClipboard = (token: string, tokenId: string) => {
    navigator.clipboard.writeText(token);
    setCopiedId(tokenId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatDate = (date: Date) => {
    return format(new Date(date), "MMM dd, yyyy HH:mm");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl sm:max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Token Details</DialogTitle>
          <DialogDescription>
            {tokenDetails ? (
              <>
                {tokenDetails.user.username || tokenDetails.user.email} (ID:{" "}
                <span className="font-mono text-xs">
                  {tokenDetails.user.id.slice(0, 8)}...
                </span>
                )
              </>
            ) : (
              "Loading..."
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <p className="text-muted-foreground">Loading tokens...</p>
            </div>
          ) : tokenDetails && tokenDetails.tokens.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Region</TableHead>
                  <TableHead>Token</TableHead>
                  <TableHead className="w-10">Copy</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tokenDetails.tokens.map((token) => (
                  <TableRow key={token.id}>
                    <TableCell className="font-mono font-semibold">
                      {token.region}
                    </TableCell>
                    <TableCell className="font-mono text-sm break-all max-w-md truncate">
                      {token.token}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(token.token, token.id)}
                        className="h-6 w-6 p-0"
                      >
                        {copiedId === token.id ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </TableCell>
                    <TableCell className="text-xs">
                      {formatDate(token.createdAt)}
                    </TableCell>
                    <TableCell className="text-xs">
                      {formatDate(token.updatedAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="flex items-center justify-center h-32">
              <p className="text-muted-foreground">No tokens found</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
