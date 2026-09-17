import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiClient } from '../api/client';
import { X, UserPlus, Mail, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

const addSenderSchema = z.object({
  name: z.string().min(1, 'Sender name is required'),
  email: z.string().email('Valid email address is required'),
});

type AddSenderFormData = z.infer<typeof addSenderSchema>;

interface AddSenderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const AddSenderModal: React.FC<AddSenderModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<AddSenderFormData>({
    resolver: zodResolver(addSenderSchema),
    defaultValues: {
      name: '',
      email: '',
    },
  });

  const onSubmit = async (data: AddSenderFormData) => {
    setIsSubmitting(true);
    try {
      await apiClient.post('/senders', data);
      toast.success(`Sender "${data.name}" added successfully with auto-generated Ethereal SMTP account!`);
      reset();
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to add sender');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-brand-400" />
            <h2 className="text-base font-bold text-white">Add New Email Sender</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Sender Name</label>
            <input
              type="text"
              placeholder="e.g. Sarah Jenkins (Outreach Lead)"
              {...register('name')}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-brand-500 transition"
            />
            {errors.name && <p className="text-[11px] text-rose-400 mt-1">{errors.name.message}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Sender Email Address</label>
            <input
              type="email"
              placeholder="sarah@reachinbox.ai"
              {...register('email')}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-brand-500 transition"
            />
            {errors.email && <p className="text-[11px] text-rose-400 mt-1">{errors.email.message}</p>}
          </div>

          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 flex items-start gap-2.5 text-xs text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <p className="text-[11px]">
              Ethereal SMTP credentials will be automatically provisioned and paired for real test email delivery previews.
            </p>
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs font-semibold text-slate-400 hover:text-white bg-slate-800/60 rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-1.5 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-500 rounded-lg shadow-lg shadow-brand-600/30 transition flex items-center gap-1.5 disabled:opacity-50"
            >
              {isSubmitting ? 'Provisioning...' : 'Add Sender'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
