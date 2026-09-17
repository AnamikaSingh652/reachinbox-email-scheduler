import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../api/client';
import { LogOut, Mail, Slack, CheckCircle, AlertCircle, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

export const Header: React.FC = () => {
  const { user, logout } = useAuth();
  const [slackStatus, setSlackStatus] = useState<{ isConnected: boolean; teamName: string | null }>({
    isConnected: false,
    teamName: null,
  });
  const [connectingSlack, setConnectingSlack] = useState(false);

  const fetchSlackStatus = async () => {
    try {
      const res = await apiClient.get('/slack/status');
      setSlackStatus(res.data);
    } catch (err) {
      setSlackStatus({ isConnected: false, teamName: null });
    }
  };

  useEffect(() => {
    fetchSlackStatus();
  }, []);

  const handleToggleSlack = async () => {
    if (slackStatus.isConnected) {
      try {
        await apiClient.post('/slack/disconnect');
        setSlackStatus({ isConnected: false, teamName: null });
        toast.success('Slack disconnected successfully');
      } catch (err) {
        toast.error('Failed to disconnect Slack');
      }
    } else {
      setConnectingSlack(true);
      try {
        // Connect mock or trigger OAuth
        await apiClient.post('/slack/mock-connect');
        await fetchSlackStatus();
        toast.success('Connected Slack sales channel!');
      } catch (err) {
        window.location.href = '/api/slack/connect';
      } finally {
        setConnectingSlack(false);
      }
    }
  };

  return (
    <header className="h-16 border-b border-slate-800 bg-slate-900/60 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-30">
      {/* Brand Logo & Title */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-brand-500/20">
          <Mail className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="font-bold text-lg text-white leading-tight flex items-center gap-2">
            ReachInbox <span className="text-xs px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-400 font-normal border border-brand-500/20">Scheduler</span>
          </h1>
          <p className="text-xs text-slate-400">AI-powered outreach & rate-limit engine</p>
        </div>
      </div>

      {/* Action Controls & User Profile */}
      <div className="flex items-center gap-4">
        {/* BullMQ Dashboard External Link */}
        <a
          href="/admin/queues"
          target="_blank"
          rel="noreferrer"
          className="hidden md:flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-800 rounded-lg border border-slate-700/60 transition"
        >
          <span>BullMQ Board</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>

        {/* Slack Connection Status Toggle */}
        <button
          onClick={handleToggleSlack}
          disabled={connectingSlack}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
            slackStatus.isConnected
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
              : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white'
          }`}
        >
          <Slack className="w-4 h-4 text-emerald-400" />
          {slackStatus.isConnected ? (
            <span className="flex items-center gap-1">
              <CheckCircle className="w-3 h-3 text-emerald-400" />
              Connected ({slackStatus.teamName || 'Slack'})
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <AlertCircle className="w-3 h-3 text-amber-400" />
              Connect Slack
            </span>
          )}
        </button>

        {/* User Info & Avatar */}
        {user && (
          <div className="flex items-center gap-3 pl-3 border-l border-slate-800">
            <img
              src={user.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'}
              alt={user.name}
              className="w-9 h-9 rounded-full object-cover ring-2 ring-brand-500/30"
            />
            <div className="hidden sm:block text-left">
              <p className="text-xs font-semibold text-slate-200">{user.name}</p>
              <p className="text-[11px] text-slate-400 truncate max-w-[140px]">{user.email}</p>
            </div>
            <button
              onClick={logout}
              title="Logout"
              className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
