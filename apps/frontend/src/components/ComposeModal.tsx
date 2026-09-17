import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiClient } from '../api/client';
import { SenderDTO } from '@reachinbox/shared';
import { X, Upload, Calendar, Clock, Gauge, Send, AlertTriangle, FileText, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

const composeSchema = z.object({
  subject: z.string().min(1, 'Subject is required'),
  body: z.string().min(1, 'Email body is required'),
  senderId: z.string().min(1, 'Please select a sender'),
  startTime: z.string().optional(),
  delayBetweenEmails: z.number().min(100, 'Minimum delay is 100ms').default(2000),
  hourlyLimit: z.number().min(1, 'Hourly limit must be at least 1').default(200),
  manualRecipients: z.string().optional(),
});

type ComposeFormData = z.infer<typeof composeSchema>;

interface ComposeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const ComposeModal: React.FC<ComposeModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [senders, setSenders] = useState<SenderDTO[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedPreview, setParsedPreview] = useState<{
    validCount: number;
    invalidCount: number;
    duplicateCount: number;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
    reset,
  } = useForm<ComposeFormData>({
    resolver: zodResolver(composeSchema),
    defaultValues: {
      subject: '',
      body: '',
      delayBetweenEmails: 2000,
      hourlyLimit: 200,
    },
  });

  useEffect(() => {
    if (isOpen) {
      apiClient.get('/senders').then((res) => {
        setSenders(res.data.senders);
        if (res.data.senders.length > 0) {
          setValue('senderId', res.data.senders[0].id);
        }
      });
    }
  }, [isOpen, setValue]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      
      // Client-side quick preview reading
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
        const emails = lines.map((l) => l.split(',')[0].trim()).filter((e) => e.includes('@'));
        setParsedPreview({
          validCount: emails.length,
          invalidCount: Math.max(0, lines.length - emails.length),
          duplicateCount: 0,
        });
      };
      reader.readAsText(file);
    }
  };

  const manualRecipientsText = watch('manualRecipients');
  useEffect(() => {
    if (manualRecipientsText && !selectedFile) {
      const list = manualRecipientsText
        .split(/[\n,;]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      const valid = list.filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));
      setParsedPreview({
        validCount: valid.length,
        invalidCount: list.length - valid.length,
        duplicateCount: 0,
      });
    }
  }, [manualRecipientsText, selectedFile]);

  const onSubmit = async (data: ComposeFormData) => {
    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('subject', data.subject);
      formData.append('body', data.body);
      formData.append('senderId', data.senderId);
      formData.append('delayBetweenEmails', data.delayBetweenEmails.toString());
      formData.append('hourlyLimit', data.hourlyLimit.toString());

      if (data.startTime) {
        formData.append('startTime', new Date(data.startTime).toISOString());
      }

      if (selectedFile) {
        formData.append('file', selectedFile);
      } else if (data.manualRecipients) {
        const recipientsArray = data.manualRecipients
          .split(/[\n,;]+/)
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        formData.append('recipients', JSON.stringify(recipientsArray));
      } else {
        toast.error('Please upload a CSV file or enter recipient email addresses');
        setIsSubmitting(false);
        return;
      }

      const res = await apiClient.post('/emails/schedule', formData);

      toast.success(`${res.data.scheduledCount} email(s) scheduled successfully!`);
      reset();
      setSelectedFile(null);
      setParsedPreview(null);
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to schedule emails');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900">
          <div className="flex items-center gap-2">
            <Send className="w-5 h-5 text-brand-400" />
            <h2 className="text-lg font-bold text-white">Compose New Outreach Campaign</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 overflow-y-auto space-y-5">
          {/* Sender Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Select Email Sender
            </label>
            <select
              {...register('senderId')}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-brand-500 transition"
            >
              {senders.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.email})
                </option>
              ))}
            </select>
            {errors.senderId && <p className="text-xs text-rose-400 mt-1">{errors.senderId.message}</p>}
          </div>

          {/* Subject Line */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Subject Line
            </label>
            <input
              type="text"
              placeholder="e.g. Quick question regarding scaling your sales pipeline"
              {...register('subject')}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-brand-500 transition"
            />
            {errors.subject && <p className="text-xs text-rose-400 mt-1">{errors.subject.message}</p>}
          </div>

          {/* Body */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Email Body Content
            </label>
            <textarea
              rows={4}
              placeholder="Hi {{name}}, I noticed your recent product launch and wanted to reach out..."
              {...register('body')}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-brand-500 transition resize-none"
            />
            {errors.body && <p className="text-xs text-rose-400 mt-1">{errors.body.message}</p>}
          </div>

          {/* Recipients CSV Upload & Manual Input */}
          <div className="space-y-3">
            <label className="block text-xs font-semibold text-slate-300">
              Recipients Upload (CSV / TXT) or Manual Input
            </label>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* File Drop Area */}
              <label className="border-2 border-dashed border-slate-800 hover:border-brand-500/50 bg-slate-950 rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer transition text-center group">
                <Upload className="w-6 h-6 text-slate-500 group-hover:text-brand-400 mb-2 transition" />
                <span className="text-xs font-medium text-slate-300">
                  {selectedFile ? selectedFile.name : 'Click or Drag CSV/TXT file'}
                </span>
                <span className="text-[10px] text-slate-500 mt-1">Auto email column detection</span>
                <input
                  type="file"
                  accept=".csv,.txt"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </label>

              {/* Manual Input */}
              <textarea
                rows={3}
                placeholder="Or paste email list (one per line or comma separated)"
                {...register('manualRecipients')}
                disabled={!!selectedFile}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-brand-500 transition resize-none disabled:opacity-50"
              />
            </div>

            {/* Recipient Validation Count Badge */}
            {parsedPreview && (
              <div className="p-3 bg-brand-500/10 border border-brand-500/20 rounded-xl flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-brand-300 font-medium">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Detected: {parsedPreview.validCount} valid email recipient(s)</span>
                </div>
                {parsedPreview.invalidCount > 0 && (
                  <span className="text-amber-400 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {parsedPreview.invalidCount} invalid row(s) skipped
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Advanced Schedule Configuration Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-slate-800">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-brand-400" />
                Start Schedule Time
              </label>
              <input
                type="datetime-local"
                {...register('startTime')}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-brand-400" />
                Send Delay (ms)
              </label>
              <input
                type="number"
                step="500"
                {...register('delayBetweenEmails', { valueAsNumber: true })}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1 flex items-center gap-1">
                <Gauge className="w-3.5 h-3.5 text-brand-400" />
                Hourly Sender Limit
              </label>
              <input
                type="number"
                {...register('hourlyLimit', { valueAsNumber: true })}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
              />
            </div>
          </div>

          {/* Actions Footer */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white bg-slate-800/60 hover:bg-slate-800 rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-500 rounded-lg shadow-lg shadow-brand-600/30 transition flex items-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Scheduling Jobs...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Schedule Emails
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
