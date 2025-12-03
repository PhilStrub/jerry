"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { PlusCircle, Trash2, Settings, Sparkles, ChevronsUpDown, Copy, Pencil, Github, Key, PanelLeftClose, PanelLeft, MessageSquareText, MoreHorizontal, Star, Search, Building2 } from "lucide-react";
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarMenuBadge,
    useSidebar
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import Image from "next/image";
import { MCPServerManager } from "./mcp-server-manager";
import { ApiKeyManager } from "./api-key-manager";
import { ThemeToggle } from "./theme-toggle";
import { getUserId, updateUserId } from "@/lib/user-id";
import { useChats } from "@/lib/hooks/use-chats";
import { cn } from "@/lib/utils";
import Link from "next/link";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMCP } from "@/lib/context/mcp-context";
import { Skeleton } from "@/components/ui/skeleton";
import { AnimatePresence, motion } from "motion/react";
import { CommentDialog } from "@/components/ui/comment-dialog";
import { RenameDialog } from "@/components/ui/rename-dialog";
import { SearchDialog } from "@/components/ui/search-dialog";
import { DeleteChatDialog } from "@/components/ui/delete-chat-dialog";
import { SettingsDialog } from "./settings-dialog";
import { useTheme } from "next-themes";

export function ChatSidebar() {
    const router = useRouter();
    const pathname = usePathname();
    const { theme } = useTheme();
    const [userId, setUserId] = useState<string>('');
    const [mcpSettingsOpen, setMcpSettingsOpen] = useState(false);
    const [apiKeySettingsOpen, setApiKeySettingsOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const { state, toggleSidebar } = useSidebar();
    const isCollapsed = state === "collapsed";
    const [editUserIdOpen, setEditUserIdOpen] = useState(false);
    const [newUserId, setNewUserId] = useState('');
    const [searchOpen, setSearchOpen] = useState(false);
    const [isTransitioning, setIsTransitioning] = useState(false);

    // Get MCP server data from context
    const { mcpServers, setMcpServers, selectedMcpServers, setSelectedMcpServers } = useMCP();

    // Get opposite theme card color for comment symbols
    const getCommentColor = () => {
        return theme === 'dark' ? 'oklch(1.00 0 0)' : 'oklch(0.23 0 0)'; // light card when dark, dark card when light
    };

    // Initialize userId
    useEffect(() => {
        setUserId(getUserId());
    }, []);

    // Global keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                setSearchOpen(true);
            }
            if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'O') {
                e.preventDefault();
                handleNewChat();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Track sidebar transitions to prevent glitches
    useEffect(() => {
        setIsTransitioning(true);
        const timer = setTimeout(() => {
            setIsTransitioning(false);
        }, 300); // Match sidebar transition duration

        return () => clearTimeout(timer);
    }, [state]);
    
    // Use TanStack Query to fetch chats
    const { chats, isLoading, deleteChat, updateChatComment, updateChatTitle, toggleChatFavorite } = useChats(userId);

    // Start a new chat
    const handleNewChat = () => {
        router.push('/');
    };

    // Delete a chat
    const handleDeleteChat = async (chatId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();

        deleteChat(chatId);
        
        // If we're currently on the deleted chat's page, navigate to home
        if (pathname === `/chat/${chatId}`) {
            router.push('/');
        }
    };

    // Update a chat comment
    const handleUpdateComment = async (chatId: string, comment: string) => {
        updateChatComment({ chatId, comment });
    };

    // Update a chat title
    const handleUpdateTitle = async (chatId: string, title: string) => {
        updateChatTitle({ chatId, title });
    };

    // Toggle chat favorite
    const handleToggleFavorite = async (chatId: string, currentFavorite: boolean) => {
        toggleChatFavorite({ chatId, isFavorite: !currentFavorite });
    };

    // Separate chats into starred and history (non-starred)
    const starredChats = chats.filter(chat => chat.isFavorite === 'true');
    const historyChats = chats.filter(chat => chat.isFavorite !== 'true');

    // MCP quick status no longer shown in sidebar

    // Handle user ID update
    const handleUpdateUserId = () => {
        if (!newUserId.trim()) {
            toast.error("User ID cannot be empty");
            return;
        }

        updateUserId(newUserId.trim());
        setUserId(newUserId.trim());
        setEditUserIdOpen(false);
        toast.success("User ID updated successfully");
        
        // Refresh the page to reload chats with new user ID
        window.location.reload();
    };

    // Show loading state if user ID is not yet initialized
    if (!userId) {
        return null; // Or a loading spinner
    }

    // Create chat loading skeletons
    const renderChatSkeletons = () => {
        return Array(3).fill(0).map((_, index) => (
            <SidebarMenuItem key={`skeleton-${index}`}>
                <div className="flex items-center gap-2 px-3 py-2">
                    <Skeleton className="h-4 w-4 rounded-full" />
                    <Skeleton className="h-4 w-full max-w-[180px]" />
                    <Skeleton className="h-5 w-5 ml-auto rounded-md flex-shrink-0" />
                </div>
            </SidebarMenuItem>
        ));
    };

    return (
        <Sidebar className="shadow-sm bg-sidebar backdrop-blur-md" collapsible="icon">
            <SidebarHeader className="p-4 relative">
                <div className="flex items-center justify-between h-6">
                    {/* AdventureWorks Icon - Fixed position */}
                    <div className={`absolute top-4 transition-none`}>
                        {isCollapsed ? (
                            <button
                                onClick={toggleSidebar}
                                className={`relative w-8 h-8 flex items-center justify-center flex-shrink-0 ${!isTransitioning ? 'group' : ''}`}
                                style={isCollapsed ? { transform: 'translateX(-8px)' } : undefined}>
                                <Building2 className={`size-6 text-foreground ${!isTransitioning ? 'group-hover:opacity-0' : ''} transition-opacity duration-300`} />
                                {!isTransitioning && (
                                    <PanelLeft className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity duration-300 absolute" />
                                )}
                            </button>
                        ) : (
                            <div className="relative w-8 h-8 flex items-center justify-center flex-shrink-0"
                            style={!isCollapsed ? { transform: 'translateX(-8px)' } : undefined}>
                                <Building2 className="size-6 text-foreground" />
                            </div>
                        )}
                    </div>

                    {/* Close button - Only when expanded */}
                    {!isCollapsed && (
                        <div className="absolute right-4 top-4">
                            <button
                                onClick={toggleSidebar}
                                className="size-6 rounded-md hover:bg-muted/50 flex items-center justify-center transition-colors group"
                                aria-label="Close sidebar"
                            >
                                <PanelLeftClose className="size-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                            </button>
                        </div>
                    )}
                </div>
            </SidebarHeader>
            
            <SidebarContent className="flex flex-col h-[calc(100vh-8rem)]">
                {/* Quick actions pinned to top */}
                <SidebarGroup>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            <SidebarMenuItem>
                                <SidebarMenuButton
                                    onClick={handleNewChat}
                                    className={cn(
                                        "flex items-center gap-2 h-8 hover:bg-sidebar-accent hover:[&>span:last-child]:opacity-100",
                                        isCollapsed ? "w-8" : "w-full"
                                    )}
                                    tooltip={isCollapsed ? "New Chat (⌘⇧O)" : undefined}
                                >
                                    <PlusCircle className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                                    {!isCollapsed && (
                                        <>
                                            <span className="truncate text-sm">New Chat</span>
                                            <span className="text-xs text-foreground/60 dark:text-foreground/80 opacity-0 pointer-events-none">⌘⇧O</span>
                                        </>
                                    )}
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                            <SidebarMenuItem>
                                <SidebarMenuButton
                                    onClick={() => setSettingsOpen(true)}
                                    className={cn(
                                        "flex items-center gap-2 h-8 hover:bg-sidebar-accent",
                                        isCollapsed ? "w-8" : "w-full"
                                    )}
                                    tooltip={isCollapsed ? "Settings" : undefined}
                                >
                                    <Settings className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                                    {!isCollapsed && <span className="truncate text-sm">Settings</span>}
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
            </SidebarContent>
            
            <SidebarFooter className={cn(
                "mt-auto flex flex-col justify-center",
                isCollapsed ? "px-0 py-4" : "p-4"
            )}>
                <ApiKeyManager
                    open={apiKeySettingsOpen}
                    onOpenChange={setApiKeySettingsOpen}
                />
            </SidebarFooter>

            {/* New consolidated Settings dialog */}
            <SettingsDialog
                open={settingsOpen}
                onOpenChange={setSettingsOpen}
                userId={userId}
                onUserIdChange={(id) => {
                    setNewUserId(id);
                    updateUserId(id);
                    setSettingsOpen(false);
                    window.location.reload();
                }}
                mcpServers={mcpServers}
                selectedMcpServers={selectedMcpServers}
                onServersChange={setMcpServers}
                onSelectedServersChange={setSelectedMcpServers}
            />

            <Dialog open={editUserIdOpen} onOpenChange={(open) => {
                setEditUserIdOpen(open);
                if (open) {
                    setNewUserId(userId);
                }
            }}>
                <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle>Edit User ID</DialogTitle>
                        <DialogDescription>
                            Update your user ID for chat synchronization. This will affect which chats are visible to you.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="userId">User ID</Label>
                            <Input
                                id="userId"
                                value={newUserId}
                                onChange={(e) => setNewUserId(e.target.value)}
                                placeholder="Enter your user ID"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setEditUserIdOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button onClick={handleUpdateUserId}>
                            Save Changes
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Sidebar>
    );
} 
