"use client";

import React from 'react';
import { Toaster } from 'sileo';
import 'sileo/styles.css';

export default function SileoProvider() {
    return (
        <Toaster
            position="top-right"
            options={{
                duration: 4000,
                autopilot: true,
            }}
        />
    );
}
