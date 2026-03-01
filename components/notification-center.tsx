'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, X, AlertCircle, Info, AlertTriangle, CheckCircle2, Trash2, Check } from 'lucide-react';
import { useNotifications, NotificationType } from './notification-provider';

const typeStyles: Record<NotificationType, { icon: any, color: string, bg: string }> = {
  info: { icon: Info, color: 'text-blue-500', bg: 'bg-blue-50' },
  success: { icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-50' },
  warning: { icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-50' },
  error: { icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-50' },
};

export function NotificationCenter() {
  const [isOpen, setIsOpen] = useState(false);
  const { notifications, unreadCount, markAsRead, markAllAsRead, deleteNotification } = useNotifications();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
      >
        <Bell className="h-6 w-6" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute right-0 mt-2 w-80 sm:w-96 overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 z-50"
          >
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="font-semibold text-slate-900">Notificações</h3>
              <div className="flex gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={() => markAllAsRead()}
                    className="text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1"
                  >
                    <Check className="h-3 w-3" />
                    Ler todas
                  </button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="max-h-[400px] overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="p-8 text-center">
                  <div className="mx-auto w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mb-3">
                    <Bell className="h-6 w-6 text-slate-400" />
                  </div>
                  <p className="text-sm text-slate-500">Sem notificações no momento.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {notifications.map((notification) => {
                    const style = typeStyles[notification.type];
                    const Icon = style.icon;
                    
                    return (
                      <div
                        key={notification.id}
                        className={`p-4 transition-colors hover:bg-slate-50 relative group ${
                          !notification.read ? 'bg-indigo-50/30' : ''
                        }`}
                      >
                        <div className="flex gap-3">
                          <div className={`mt-1 p-1.5 rounded-lg ${style.bg} ${style.color}`}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className={`text-sm font-semibold truncate ${
                                !notification.read ? 'text-slate-900' : 'text-slate-600'
                              }`}>
                                {notification.title}
                              </p>
                              <span className="text-[10px] text-slate-400 whitespace-nowrap">
                                {new Date(notification.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                              {notification.message}
                            </p>
                            
                            <div className="mt-3 flex gap-3">
                              {!notification.read && (
                                <button
                                  onClick={() => markAsRead(notification.id)}
                                  className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider hover:text-indigo-700"
                                >
                                  Marcar como lida
                                </button>
                              )}
                              <button
                                onClick={() => deleteNotification(notification.id)}
                                className="text-[10px] font-bold text-slate-400 uppercase tracking-wider hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                Eliminar
                              </button>
                            </div>
                          </div>
                        </div>
                        {!notification.read && (
                          <div className="absolute top-4 right-4 h-2 w-2 rounded-full bg-indigo-600" />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {notifications.length > 0 && (
              <div className="p-3 bg-slate-50 border-t border-slate-100 text-center">
                <button className="text-xs font-semibold text-slate-500 hover:text-slate-700">
                  Ver histórico completo
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
