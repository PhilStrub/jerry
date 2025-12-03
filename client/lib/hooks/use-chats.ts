import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { type Chat } from '@/lib/db/schema';
import { toast } from 'sonner';


export function useChats(userId: string) {
  const queryClient = useQueryClient();
  
  // Main query to fetch chats
  const {
    data: chats = [],
    isLoading,
    error,
    refetch
  } = useQuery<Chat[]>({
    queryKey: ['chats', userId],
    queryFn: async () => {
      if (!userId) return [];
      
      const response = await fetch('/api/chats', {
        headers: {
          'x-user-id': userId
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch chats');
      }
      
      return response.json();
    },
    enabled: !!userId && userId.length > 0, // Only run query if userId exists and is non-empty
    staleTime: 1000 * 60 * 5, // Consider data fresh for 5 minutes
    refetchOnWindowFocus: true, // Refetch when window regains focus
  });

  // Mutation to delete a chat
  const deleteChat = useMutation({
    mutationFn: async (chatId: string) => {
      const response = await fetch(`/api/chats/${chatId}`, {
        method: 'DELETE',
        headers: {
          'x-user-id': userId
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete chat');
      }
      
      return chatId;
    },
    onSuccess: (deletedChatId) => {
      // Update cache by removing the deleted chat
      queryClient.setQueryData<Chat[]>(['chats', userId], (oldChats = []) => 
        oldChats.filter(chat => chat.id !== deletedChatId)
      );
      
      toast.success('Chat deleted');
    },
    onError: (error) => {
      console.error('Error deleting chat:', error);
      toast.error('Failed to delete chat');
    }
  });

  // Mutation to update chat comment
  const updateChatComment = useMutation({
    mutationFn: async ({ chatId, comment }: { chatId: string; comment: string }) => {
      const response = await fetch(`/api/chats/${chatId}/comment`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId
        },
        body: JSON.stringify({ comment })
      });
      
      if (!response.ok) {
        throw new Error('Failed to update comment');
      }
      
      return response.json();
    },
    onSuccess: (updatedChat) => {
      // Update cache with the updated chat
      queryClient.setQueryData<Chat[]>(['chats', userId], (oldChats = []) => 
        oldChats.map(chat => 
          chat.id === updatedChat.id ? { ...chat, comment: updatedChat.comment } : chat
        )
      );
      
      toast.success('Comment updated');
    },
    onError: (error) => {
      console.error('Error updating comment:', error);
      toast.error('Failed to update comment');
    }
  });

  // Mutation to toggle chat favorite
  const toggleChatFavorite = useMutation({
    mutationFn: async ({ chatId, isFavorite }: { chatId: string; isFavorite: boolean }) => {
      const response = await fetch(`/api/chats/${chatId}/favorite`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId
        },
        body: JSON.stringify({ isFavorite })
      });
      
      if (!response.ok) {
        throw new Error('Failed to update favorite');
      }
      
      return response.json();
    },
    onSuccess: (updatedChat) => {
      // Update cache with the updated chat
      queryClient.setQueryData<Chat[]>(['chats', userId], (oldChats = []) => 
        oldChats.map(chat => 
          chat.id === updatedChat.id ? { ...chat, isFavorite: updatedChat.isFavorite } : chat
        )
      );
      
      toast.success(updatedChat.isFavorite === 'true' ? 'Added to favorites' : 'Removed from favorites');
    },
    onError: (error) => {
      console.error('Error updating favorite:', error);
      toast.error('Failed to update favorite');
    }
  });

  // Mutation to update chat title
  const updateChatTitle = useMutation({
    mutationFn: async ({ chatId, title }: { chatId: string; title: string }) => {
      const response = await fetch(`/api/chats/${chatId}/title`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId
        },
        body: JSON.stringify({ title })
      });
      
      if (!response.ok) {
        throw new Error('Failed to update title');
      }
      
      return response.json();
    },
    onSuccess: (updatedChat) => {
      // Update cache with the updated chat
      queryClient.setQueryData<Chat[]>(['chats', userId], (oldChats = []) => 
        oldChats.map(chat => 
          chat.id === updatedChat.id ? { ...chat, title: updatedChat.title } : chat
        )
      );
      
      toast.success('Chat renamed successfully');
    },
    onError: (error) => {
      console.error('Error updating title:', error);
      toast.error('Failed to rename chat');
    }
  });

  // Function to invalidate chats cache for refresh
  const refreshChats = () => {
    queryClient.invalidateQueries({ queryKey: ['chats', userId] });
  };

  return {
    chats,
    isLoading,
    error,
    deleteChat: deleteChat.mutate,
    isDeleting: deleteChat.isPending,
    updateChatComment: updateChatComment.mutate,
    isUpdatingComment: updateChatComment.isPending,
    updateChatTitle: updateChatTitle.mutate,
    isUpdatingTitle: updateChatTitle.isPending,
    toggleChatFavorite: toggleChatFavorite.mutate,
    isTogglingFavorite: toggleChatFavorite.isPending,
    refreshChats,
    refetch
  };
} 