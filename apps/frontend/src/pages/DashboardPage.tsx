import React, { useState, useEffect, useCallback } from 'react';
import { Header } from '../components/Header';
import { ComposeModal } from '../components/ComposeModal';
import { AddSenderModal } from '../components/AddSenderModal';
import { EmailTable } from '../components/EmailTable';
import { apiClient } from '../api/client';
import { ScheduledEmailDTO, SenderDTO, EmailCampaignDTO, EmailStatus } from '@reachinbox/shared';
import {
  Plus,
  Search,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Send,
  Layers,
  UserCheck,
  Database,
  UserPlus,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

export const DashboardPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'scheduled' | 'sent' | 'senders' | 'campaigns'>('scheduled');
  const [scheduledEmails, setScheduledEmails] = useState<ScheduledEmailDTO[]>([]);
  const [sentEmails, setSentEmails] = useState<ScheduledEmailDTO[]>([]);
  const [senders, setSenders] = useState<SenderDTO[]>([]);
  const [campaigns, setCampaigns] = useState<EmailCampaignDTO[]>([]);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<ScheduledEmailDTO[] | null>(null);

  const [loading, setLoading] = useState(true);
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [isAddSenderOpen, setIsAddSenderOpen] = useState(false);
  const [reindexing, setReindexing] = useState(false);

  // Fetch all dashboard data
  const fetchData = useCallback(async () => {
    try {
      const [schedRes, sentRes, sendersRes, campRes] = await Promise.all([
        apiClient.get('/emails/scheduled'),
        apiClient.get('/emails/sent'),
        apiClient.get('/senders'),
        apiClient.get('/campaigns'),
      ]);

      setScheduledEmails(schedRes.data.emails);
      setSentEmails(sentRes.data.emails);
      setSenders(sendersRes.data.senders);
      setCampaigns(campRes.data.campaigns);
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll for status updates every 3 seconds
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Debounced Elasticsearch Search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await apiClient.get(`/emails/search?q=${encodeURIComponent(searchQuery)}`);
        setSearchResults(res.data.emails);
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Handle manual ES Reindex
  const handleReindex = async () => {
    setReindexing(true);
    try {
      const res = await apiClient.post('/admin/emails/reindex');
      toast.success(res.data.message || 'Elasticsearch reindexed successfully');
    } catch (err: any) {
      toast.error('Reindex failed');
    } finally {
      setReindexing(false);
    }
  };

  // Metrics summary
  const totalScheduled = scheduledEmails.filter((e) => e.status === EmailStatus.SCHEDULED).length;
  const totalProcessing = scheduledEmails.filter((e) => e.status === EmailStatus.PROCESSING).length;
  const totalSent = sentEmails.filter((e) => e.status === EmailStatus.SENT).length;
  const totalFailed = sentEmails.filter((e) => e.status === EmailStatus.FAILED).length;

  const currentEmails = searchResults
    ? searchResults.filter((e) =>
        activeTab === 'scheduled'
          ? e.status === EmailStatus.SCHEDULED || e.status === EmailStatus.PROCESSING
          : e.status === EmailStatus.SENT || e.status === EmailStatus.FAILED || e.status === EmailStatus.CANCELLED
      )
    : activeTab === 'scheduled'
    ? scheduledEmails
    : sentEmails;

  // Handle manual sender deletion
  const handleDeleteSender = async (senderId: string) => {
    try {
      await apiClient.delete(`/senders/${senderId}`);
      toast.success('Sender deleted successfully');
      fetchData();
    } catch (err: any) {
      toast.error('Failed to delete sender');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Header />

      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        {/* Metric Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 flex items-center justify-between shadow-lg">
            <div>
              <p className="text-xs font-medium text-slate-400">Scheduled Queue</p>
              <h3 className="text-2xl font-bold text-white mt-1">{totalScheduled}</h3>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center border border-amber-500/20">
              <Clock className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 flex items-center justify-between shadow-lg">
            <div>
              <p className="text-xs font-medium text-slate-400">Active Workers</p>
              <h3 className="text-2xl font-bold text-white mt-1">{totalProcessing}</h3>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center border border-blue-500/20">
              <RefreshCw className="w-5 h-5 animate-spin" />
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 flex items-center justify-between shadow-lg">
            <div>
              <p className="text-xs font-medium text-slate-400">Successfully Sent</p>
              <h3 className="text-2xl font-bold text-white mt-1">{totalSent}</h3>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 flex items-center justify-between shadow-lg">
            <div>
              <p className="text-xs font-medium text-slate-400">Send Failures</p>
              <h3 className="text-2xl font-bold text-white mt-1">{totalFailed}</h3>
            </div>
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-400 flex items-center justify-center border border-rose-500/20">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Action Header: Search & Compose CTA */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-slate-900/40 p-4 rounded-2xl border border-slate-800/80">
          {/* Debounced Elasticsearch Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by recipient, subject, or content (Elasticsearch)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-500 transition"
            />
            {isSearching && (
              <RefreshCw className="w-3.5 h-3.5 text-brand-400 animate-spin absolute right-3.5 top-1/2 -translate-y-1/2" />
            )}
          </div>

          {/* Primary CTA & Admin Reindex */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleReindex}
              disabled={reindexing}
              title="Reindex Elasticsearch search index from PostgreSQL"
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium border border-slate-700/60 transition flex items-center gap-1.5"
            >
              <Database className="w-3.5 h-3.5 text-slate-400" />
              {reindexing ? 'Reindexing...' : 'ES Reindex'}
            </button>

            <button
              onClick={() => setIsComposeOpen(true)}
              className="px-5 py-2.5 bg-brand-600 hover:bg-brand-500 text-white font-semibold text-xs rounded-xl shadow-lg shadow-brand-600/30 transition flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Compose New Email
            </button>
          </div>
        </div>

        {/* Main Content Tabs */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab('scheduled')}
                className={`px-4 py-2 text-xs font-semibold rounded-xl transition flex items-center gap-2 ${
                  activeTab === 'scheduled'
                    ? 'bg-brand-600/20 text-brand-300 border border-brand-500/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                Scheduled Emails ({scheduledEmails.length})
              </button>

              <button
                onClick={() => setActiveTab('sent')}
                className={`px-4 py-2 text-xs font-semibold rounded-xl transition flex items-center gap-2 ${
                  activeTab === 'sent'
                    ? 'bg-brand-600/20 text-brand-300 border border-brand-500/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <Send className="w-3.5 h-3.5" />
                Sent Emails ({sentEmails.length})
              </button>

              <button
                onClick={() => setActiveTab('campaigns')}
                className={`px-4 py-2 text-xs font-semibold rounded-xl transition flex items-center gap-2 ${
                  activeTab === 'campaigns'
                    ? 'bg-brand-600/20 text-brand-300 border border-brand-500/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                Campaigns ({campaigns.length})
              </button>

              <button
                onClick={() => setActiveTab('senders')}
                className={`px-4 py-2 text-xs font-semibold rounded-xl transition flex items-center gap-2 ${
                  activeTab === 'senders'
                    ? 'bg-brand-600/20 text-brand-300 border border-brand-500/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <UserCheck className="w-3.5 h-3.5" />
                Senders ({senders.length})
              </button>
            </div>

            {activeTab === 'senders' && (
              <button
                onClick={() => setIsAddSenderOpen(true)}
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-700 transition flex items-center gap-1.5"
              >
                <UserPlus className="w-3.5 h-3.5 text-brand-400" />
                Add New Sender
              </button>
            )}
          </div>

          {/* Tab Views */}
          {activeTab === 'scheduled' || activeTab === 'sent' ? (
            <EmailTable
              emails={currentEmails}
              loading={loading}
              type={activeTab}
              onRefresh={fetchData}
            />
          ) : activeTab === 'senders' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {senders.map((s) => (
                <div key={s.id} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-2 relative group">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-sm text-white">{s.name}</h4>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        Ethereal SMTP
                      </span>
                      {senders.length > 1 && (
                        <button
                          onClick={() => handleDeleteSender(s.id)}
                          title="Delete sender"
                          className="text-slate-500 hover:text-rose-400 p-1 rounded transition opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-slate-400">{s.email}</p>
                  <p className="text-[11px] font-mono text-slate-500 truncate">User: {s.etherealUser}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {campaigns.map((c) => (
                <div key={c.id} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-sm text-white">{c.subject}</h4>
                    <span className="text-xs text-slate-400 font-mono">
                      {new Date(c.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 line-clamp-2">{c.body}</p>
                  <div className="flex items-center justify-between text-xs text-slate-500 border-t border-slate-800 pt-3">
                    <span>Delay: {c.delayBetweenEmails}ms</span>
                    <span>Hourly Limit: {c.hourlyLimit}/hr</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Compose Modal */}
      <ComposeModal
        isOpen={isComposeOpen}
        onClose={() => setIsComposeOpen(false)}
        onSuccess={fetchData}
      />

      {/* Add Sender Modal */}
      <AddSenderModal
        isOpen={isAddSenderOpen}
        onClose={() => setIsAddSenderOpen(false)}
        onSuccess={fetchData}
      />
    </div>
  );
};
