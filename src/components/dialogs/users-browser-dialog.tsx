"use client";

import {
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AnimatedDialog, AnimatedDialogContent } from "@/components/ui/animated-dialog";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "../ui/button";
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '@/server/routers/_app';
import superjson from 'superjson';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Search, X } from "lucide-react";
import { Input } from "../ui/input";
import { TokenDetailsDialog } from "./token-details-dialog";

interface UsersBrowserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  adminToken: string;
}

type User = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  createdAt: Date;
  updatedAt: Date;
  username: string | null;
  language: string | null;
  role: string;
  banned: boolean;
  banReason: string | null;
  banExpires: Date | null;
  region: string | null;
  publishProfile: boolean;
  fetchUseAlbums: boolean | null;
  tokens: string;
};

export function UsersBrowserDialog({
  open,
  onOpenChange,
  adminToken,
}: UsersBrowserDialogProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [tokenDetailsOpen, setTokenDetailsOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const limit = 50;

  // Create tRPC client with Bearer token
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

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const result = await adminTrpc.admin.users.listUsers.query({
        limit,
        offset: page * limit,
        search: search || undefined,
      });
      setUsers(result.users as User[]);
      setTotal(result.total);
    } catch (error) {
      console.error("Failed to fetch users:", error);
    } finally {
      setLoading(false);
    }
  }, [adminTrpc, page, limit, search]);

  useEffect(() => {
    if (open && adminToken) {
      fetchUsers();
    }
  }, [open, adminToken, fetchUsers]);

  useEffect(() => {
    setPage(0);
  }, [search]);

  const handleResetFetchAlbums = useCallback(
    async (userId: string, username: string | null) => {
      try {
        await adminTrpc.admin.users.resetFetchAlbums.mutate({
          identifier: username || userId,
        });
        // Refresh the users list
        await fetchUsers();
      } catch (error) {
        console.error("Failed to reset fetch albums:", error);
      }
    },
    [adminTrpc, fetchUsers]
  );

  const totalPages = Math.ceil(total / limit);

  const formatDate = (date: Date) => {
    return format(new Date(date), "MMM dd, yyyy HH:mm");
  };

  return (
    <>
      <AnimatedDialog open={open} onOpenChange={onOpenChange} modal={false}>
        <AnimatedDialogContent className="max-w-[95vw]! max-h-[95vh]! sm:max-w-[95vw]! sm:max-h-[95vh]! w-[95vw] h-[95vh] shadow flex flex-col">
          <DialogHeader>
            <DialogTitle>Users Browser</DialogTitle>
            <DialogDescription>
              Total users: {total} | Page {page + 1} of {totalPages || 1}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col flex-1 min-h-0 space-y-4">
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Search by username..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 pr-8"
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            <div
              className="flex-1 min-w-0 min-h-0 overflow-x-scroll overflow-y-scroll pointer-events-auto"
              onMouseEnter={(e) => e.currentTarget.focus()}
              onWheel={(e) => {
                e.currentTarget.scrollTop += e.deltaY;
                e.currentTarget.scrollLeft += e.deltaX;
              }}
              tabIndex={0}
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">Actions</TableHead>
                    <TableHead>ID</TableHead>
                    <TableHead>Username</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Banned</TableHead>
                    <TableHead>Region</TableHead>
                    <TableHead>Tokens</TableHead>
                    <TableHead>Public Profile</TableHead>
                    <TableHead>Email Verified</TableHead>
                    <TableHead>Fetch Albums</TableHead>
                    <TableHead>Ban Reason</TableHead>
                    <TableHead>Ban Expires</TableHead>
                    <TableHead>Created At</TableHead>
                    <TableHead>Updated At</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={16} className="text-center py-4">
                        Loading...
                      </TableCell>
                    </TableRow>
                  ) : users.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={16} className="text-center py-4">
                        No users found
                      </TableCell>
                    </TableRow>
                  ) : (
                    users.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell className="w-10">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelectedUserId(u.id);
                                  setTokenDetailsOpen(true);
                                }}
                              >
                                View Token Details
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  handleResetFetchAlbums(u.id, u.username)
                                }
                              >
                                Reset Fetch Albums
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                        <TableCell className="text-xs font-mono truncate max-w-[80px]">
                          {u.id}
                        </TableCell>
                        <TableCell>{u.username || "-"}</TableCell>
                        <TableCell className="truncate max-w-[150px]">
                          {u.email}
                        </TableCell>
                        <TableCell>{u.name}</TableCell>
                        <TableCell>{u.role}</TableCell>
                        <TableCell>{u.banned ? "Yes" : "No"}</TableCell>
                        <TableCell>{u.region || "-"}</TableCell>
                        <TableCell className="text-xs">{u.tokens || "-"}</TableCell>
                        <TableCell>{u.publishProfile ? "Yes" : "No"}</TableCell>
                        <TableCell>{u.emailVerified ? "Yes" : "No"}</TableCell>
                        <TableCell>
                          {u.fetchUseAlbums === null
                            ? "Not Set"
                            : u.fetchUseAlbums
                              ? "Yes"
                              : "No"}
                        </TableCell>
                        <TableCell className="text-xs max-w-[100px] truncate">
                          {u.banReason || "-"}
                        </TableCell>
                        <TableCell className="text-xs">
                          {u.banExpires ? formatDate(u.banExpires) : "-"}
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {formatDate(u.createdAt)}
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {formatDate(u.updatedAt)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between pt-4 border-t flex-shrink-0">
              <div className="text-sm text-muted-foreground">
                Showing {page * limit + 1}-{Math.min((page + 1) * limit, total)} of{" "}
                {total}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0 || loading}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                  disabled={page >= totalPages - 1 || loading}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        </AnimatedDialogContent>
      </AnimatedDialog>

      <TokenDetailsDialog
        open={tokenDetailsOpen}
        onOpenChange={setTokenDetailsOpen}
        adminToken={adminToken}
        userId={selectedUserId}
      />
    </>
  );
}
