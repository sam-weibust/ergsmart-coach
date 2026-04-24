import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  FlatList,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { Card } from '../../components/ui/Card';
import type { Team, TeamMember, Message } from '../../types';

function MemberAvatar({ member }: { member: TeamMember }) {
  const initials = [member.profile.first_name[0], member.profile.last_name[0]]
    .filter(Boolean)
    .join('')
    .toUpperCase();

  return (
    <View className="w-10 h-10 rounded-full bg-primary/10 items-center justify-center">
      {member.profile.avatar_url ? (
        <Image
          source={{ uri: member.profile.avatar_url }}
          className="w-10 h-10 rounded-full"
        />
      ) : (
        <Text className="text-primary font-bold text-sm">{initials}</Text>
      )}
    </View>
  );
}

export default function TeamsScreen() {
  const userId = useAuthStore((s) => s.user?.id);
  const [newMessage, setNewMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);

  // Fetch user's team
  const teamQuery = useQuery({
    queryKey: ['my-team', userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from('team_members')
        .select('team_id, teams(*)')
        .eq('user_id', userId)
        .limit(1)
        .single();
      if (error) return null;
      return (data?.teams as unknown as Team) ?? null;
    },
    enabled: !!userId,
  });

  const team = teamQuery.data;

  // Fetch team members
  const membersQuery = useQuery({
    queryKey: ['team-members', team?.id],
    queryFn: async () => {
      if (!team?.id) return [];
      const { data, error } = await supabase
        .from('team_members')
        .select('*, profile:profiles(*)')
        .eq('team_id', team.id)
        .order('role');
      if (error) throw new Error(error.message);
      return (data as unknown as TeamMember[]) ?? [];
    },
    enabled: !!team?.id,
  });

  // Fetch team messages
  const messagesQuery = useQuery({
    queryKey: ['team-messages', team?.id],
    queryFn: async () => {
      if (!team?.id) return [];
      const { data, error } = await supabase
        .from('team_messages')
        .select('*, profile:profiles(first_name, last_name, avatar_url)')
        .eq('team_id', team.id)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw new Error(error.message);
      return (data as unknown as Message[]) ?? [];
    },
    enabled: !!team?.id,
    refetchInterval: 30000, // Poll every 30s
  });

  const sendMessage = async () => {
    if (!newMessage.trim() || !team?.id || !userId) return;
    setSendingMessage(true);
    await supabase.from('team_messages').insert({
      team_id: team.id,
      user_id: userId,
      content: newMessage.trim(),
    });
    setNewMessage('');
    messagesQuery.refetch();
    setSendingMessage(false);
  };

  if (teamQuery.isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-surface items-center justify-center" edges={['top']}>
        <ActivityIndicator size="large" color="#1B3A6B" />
      </SafeAreaView>
    );
  }

  if (!team) {
    return (
      <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
        <View className="bg-white px-5 pt-4 pb-4 border-b border-gray-100">
          <Text className="text-xl font-bold text-gray-900">Teams</Text>
        </View>
        <View className="flex-1 items-center justify-center px-6">
          <Feather name="users" size={48} color="#E5E7EB" />
          <Text className="text-gray-500 font-semibold mt-4 text-base text-center">
            You're not on a team yet
          </Text>
          <Text className="text-gray-400 text-sm mt-2 text-center">
            Ask your coach to add you to a team, or create your own.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const members = membersQuery.data ?? [];
  const messages = messagesQuery.data ?? [];
  const coaches = members.filter((m) => m.role === 'coach' || m.role === 'assistant_coach');
  const athletes = members.filter((m) => m.role === 'athlete');

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      {/* Header */}
      <View className="bg-white px-5 pt-4 pb-4 border-b border-gray-100">
        <Text className="text-xl font-bold text-gray-900">{team.name}</Text>
        <Text className="text-sm text-gray-500 mt-0.5">
          {members.length} member{members.length !== 1 ? 's' : ''}
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="px-4 pt-4 gap-4">
          {/* Team Stats */}
          <View className="flex-row gap-3">
            <View className="flex-1 bg-white rounded-2xl border border-gray-100 shadow-sm p-4 items-center">
              <Text className="text-2xl font-bold text-primary">{athletes.length}</Text>
              <Text className="text-xs text-gray-500 mt-0.5">Athletes</Text>
            </View>
            <View className="flex-1 bg-white rounded-2xl border border-gray-100 shadow-sm p-4 items-center">
              <Text className="text-2xl font-bold text-primary">{coaches.length}</Text>
              <Text className="text-xs text-gray-500 mt-0.5">Coaches</Text>
            </View>
          </View>

          {/* Coaches */}
          {coaches.length > 0 && (
            <Card title="Coaches">
              <View className="gap-3">
                {coaches.map((member) => (
                  <View key={member.id} className="flex-row items-center">
                    <MemberAvatar member={member} />
                    <View className="ml-3 flex-1">
                      <Text className="text-sm font-semibold text-gray-900">
                        {member.profile.first_name} {member.profile.last_name}
                      </Text>
                      <Text className="text-xs text-gray-500 capitalize">
                        {member.role.replace('_', ' ')}
                      </Text>
                    </View>
                    <Feather name="chevron-right" size={16} color="#9CA3AF" />
                  </View>
                ))}
              </View>
            </Card>
          )}

          {/* Roster */}
          <Card
            title="Roster"
            subtitle={`${athletes.length} athletes`}
          >
            {membersQuery.isLoading ? (
              <ActivityIndicator color="#1B3A6B" />
            ) : athletes.length === 0 ? (
              <Text className="text-gray-400 text-sm">No athletes yet</Text>
            ) : (
              <View className="gap-2">
                {athletes.map((member) => (
                  <View
                    key={member.id}
                    className="flex-row items-center py-2 border-b border-gray-50 last:border-0"
                  >
                    <MemberAvatar member={member} />
                    <View className="ml-3 flex-1">
                      <Text className="text-sm font-semibold text-gray-900">
                        {member.profile.first_name} {member.profile.last_name}
                      </Text>
                    </View>
                    <Feather name="chevron-right" size={16} color="#E5E7EB" />
                  </View>
                ))}
              </View>
            )}
          </Card>

          {/* Message Board */}
          <Card title="Message Board">
            {/* Message Input */}
            <View className="flex-row items-end gap-2 mb-4">
              <TextInput
                value={newMessage}
                onChangeText={setNewMessage}
                placeholder="Message your team..."
                placeholderTextColor="#9CA3AF"
                multiline
                className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900"
                style={{ maxHeight: 100, textAlignVertical: 'top' }}
              />
              <Pressable
                onPress={sendMessage}
                disabled={!newMessage.trim() || sendingMessage}
                className={[
                  'w-10 h-10 rounded-xl items-center justify-center',
                  newMessage.trim() ? 'bg-primary active:bg-primary-600' : 'bg-gray-200',
                ].join(' ')}
              >
                {sendingMessage ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Feather
                    name="send"
                    size={16}
                    color={newMessage.trim() ? 'white' : '#9CA3AF'}
                  />
                )}
              </Pressable>
            </View>

            {/* Messages */}
            {messagesQuery.isLoading ? (
              <ActivityIndicator color="#1B3A6B" />
            ) : messages.length === 0 ? (
              <View className="items-center py-4">
                <Feather name="message-circle" size={28} color="#E5E7EB" />
                <Text className="text-gray-400 text-sm mt-2">
                  No messages yet. Say hello!
                </Text>
              </View>
            ) : (
              <View className="gap-4">
                {messages.map((msg) => {
                  const senderName = `${msg.profile.first_name} ${msg.profile.last_name}`;
                  const initials = [msg.profile.first_name[0], msg.profile.last_name[0]]
                    .filter(Boolean)
                    .join('')
                    .toUpperCase();
                  const isOwn = msg.user_id === userId;

                  return (
                    <View
                      key={msg.id}
                      className={`flex-row ${isOwn ? 'flex-row-reverse' : 'flex-row'} gap-2`}
                    >
                      <View className="w-8 h-8 rounded-full bg-primary/10 items-center justify-center self-end">
                        {msg.profile.avatar_url ? (
                          <Image
                            source={{ uri: msg.profile.avatar_url }}
                            className="w-8 h-8 rounded-full"
                          />
                        ) : (
                          <Text className="text-primary text-xs font-bold">
                            {initials}
                          </Text>
                        )}
                      </View>
                      <View
                        className={`max-w-3/4 ${isOwn ? 'items-end' : 'items-start'}`}
                        style={{ maxWidth: '75%' }}
                      >
                        {!isOwn && (
                          <Text className="text-xs text-gray-400 mb-1">
                            {senderName}
                          </Text>
                        )}
                        <View
                          className={[
                            'px-3 py-2 rounded-2xl',
                            isOwn ? 'bg-primary rounded-tr-sm' : 'bg-gray-100 rounded-tl-sm',
                          ].join(' ')}
                        >
                          <Text
                            className={`text-sm ${isOwn ? 'text-white' : 'text-gray-800'}`}
                          >
                            {msg.content}
                          </Text>
                        </View>
                        <Text className="text-xs text-gray-300 mt-1">
                          {format(parseISO(msg.created_at), 'h:mm a')}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
