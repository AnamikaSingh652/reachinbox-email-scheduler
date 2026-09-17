import React from 'react';
import { ScheduledEmailDTO, EmailStatus } from '@reachinbox/shared';
import { StatusBadge } from './StatusBadge';
import { ExternalLink, Calendar, Mail, Ban, AlertCircle } from 'lucide-react';
import { apiClient } from '../api/client';
import { toast } from 'sonner';

interface EmailTableProps {
  emails: ScheduledEmailDTO[];
  loading: boolean;
  type: 'scheduled' | 'sent';
  onRefresh: () => void;
}

export const EmailTable: React.FC<EmailTableProps> = ({ emails, loading, type, onRefresh }) => {
  const handleCancelEmail = async (id: string) => {
    try {
      await apiClient.post(`/emails/${id}/cancel`);
      toast.success('Email schedule cancelled');
      onRefresh();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to cancel email');
    }
  };

  if (loading) {
    return (
      <div className="space-y-3 p-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-14 bg-slate-900/60 rounded-xl animate-pulse border border-slate-800" />
        ))}
      </div>
    );
  }

  if (emails.length === 0) {
    return (
      <div className="py-16 text-center border border-slate-800/80 rounded-2xl bg-slate-900/30">
        <div className="w-12 h-12 rounded-2xl bg-slate-800/60 flex items-center justify-center mx-auto mb-3 text-slate-500">
          <Mail className="w-6 h-6" />
        </div>
        <h3 className="text-sm font-semibold text-slate-300">No {type} emails found</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
          {type === 'scheduled'
            ? 'Start by creating a new outreach campaign to queue up email sends.'
            : 'Sent email delivery history and Nodemailer Ethereal preview links will show up here.'}
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/40">
      <table className="w-full text-left text-xs text-slate-300">
        <thead className="bg-slate-900/90 text-slate-400 font-semibold border-b border-slate-800 uppercase tracking-wider text-[11px]">
          <tr>
            <th className="px-5 py-3.5">Recipient</th>
            <th className="px-5 py-3.5">Subject</th>
            <th className="px-5 py-3.5">{type === 'scheduled' ? 'Scheduled Time' : 'Sent / Status Time'}</th>
            <th className="px-5 py-3.5">Status</th>
            <th className="px-5 py-3.5 text-right">Actions / Details</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/60">
          {emails.map((email) => (
            <tr key={email.id} className="hover:bg-slate-800/30 transition">
              {/* Recipient */}
              <td className="px-5 py-4 font-medium text-white max-w-[200px] truncate">
                {email.recipient}
              </td>

              {/* Subject */}
              <td className="px-5 py-4 max-w-[280px] truncate text-slate-300">
                {email.subject}
              </td>

              {/* Time */}
              <td className="px-5 py-4 text-slate-400 font-mono text-[11px]">
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-500" />
                  {type === 'scheduled'
                    ? new Date(email.scheduledAt).toLocaleString()
                    : email.sentAt
                    ? new Date(email.sentAt).toLocaleString()
                    : new Date(email.updatedAt).toLocaleString()}
                </div>
              </td>

              {/* Status */}
              <td className="px-5 py-4">
                <StatusBadge status={email.status} />
              </td>

              {/* Actions */}
              <td className="px-5 py-4 text-right">
                <div className="flex items-center justify-end gap-2">
                  {email.etherealPreviewUrl && (
                    <a
                      href={email.etherealPreviewUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-brand-500/10 text-brand-300 hover:bg-brand-500/20 border border-brand-500/30 transition inline-flex items-center gap-1"
                    >
                      Preview
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}

                  {type === 'scheduled' && email.status === EmailStatus.SCHEDULED && (
                    <button
                      onClick={() => handleCancelEmail(email.id)}
                      className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/30 transition inline-flex items-center gap-1"
                    >
                      <Ban className="w-3 h-3" />
                      Cancel
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
