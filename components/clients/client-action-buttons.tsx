'use client';

import { useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { CreateTrialModal } from './create-trial-modal';
import { GoogleMapsBotModal } from './google-maps-bot-modal';

export function ClientActionButtons() {
  const [isTrialOpen, setIsTrialOpen] = useState(false);
  const [isMapsOpen, setIsMapsOpen] = useState(false);

  return (
    <>
      <div className="flex gap-3">
        <button 
          onClick={() => setIsTrialOpen(true)}
          className="flex items-center rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white transition hover:bg-indigo-700"
        >
          <Plus className="mr-2 h-5 w-5" />
          Criar Cliente Trial
        </button>
        <button 
          onClick={() => setIsMapsOpen(true)}
          className="flex items-center rounded-lg border border-slate-300 bg-white px-4 py-2 font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          <Search className="mr-2 h-5 w-5" />
          Gerar Bot por Link
        </button>
      </div>

      <CreateTrialModal isOpen={isTrialOpen} onClose={() => setIsTrialOpen(false)} />
      <GoogleMapsBotModal isOpen={isMapsOpen} onClose={() => setIsMapsOpen(false)} />
    </>
  );
}
