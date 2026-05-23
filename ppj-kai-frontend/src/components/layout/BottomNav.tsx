'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function BottomNav() {
  const pathname = usePathname();

  const navItems = [
    { name: 'Track', icon: 'map', href: '/inspeksi' },
  ];

  return (
    <nav className="flex justify-around items-center w-full h-20 px-2 bg-surface/80 dark:bg-inverse-surface/80 backdrop-blur-md fixed bottom-0 z-50 pb-safe shadow-[0px_-4px_20px_rgba(0,0,0,0.05)] text-primary dark:text-primary-fixed-dim font-label-sm text-label-sm">
      {navItems.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(item.href);
        
        return (
          <Link 
            key={item.name}
            href={item.href}
            className={`flex flex-col items-center justify-center rounded-xl px-4 py-1.5 active:scale-90 transition-transform duration-200 ${
              isActive 
                ? 'bg-primary-container dark:bg-primary text-on-primary-container dark:text-on-primary' 
                : 'text-on-surface-variant dark:text-outline-variant hover:bg-surface-container-low dark:hover:bg-on-tertiary-fixed-variant'
            }`}
          >
            <span 
              className="material-symbols-outlined" 
              style={isActive ? { fontVariationSettings: "'FILL' 1" } : undefined}
            >
              {item.icon}
            </span>
            <span className="mt-1">{item.name}</span>
          </Link>
        );
      })}
    </nav>
  );
}
