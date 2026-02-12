'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

interface GlassCardProps {
    children: ReactNode;
    className?: string;
    delay?: number;
    hoverEffect?: boolean;
}

export function GlassCard({ children, className, delay = 0, hoverEffect = true }: GlassCardProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
                duration: 0.8,
                delay,
                type: "spring",
                stiffness: 100,
                damping: 20
            }}
            whileHover={hoverEffect ? {
                y: -5,
                scale: 1.02,
                transition: { duration: 0.3 }
            } : {}}
            className={cn("glass-card", className)}
        >
            {children}
        </motion.div>
    );
}
