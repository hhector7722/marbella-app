'use client';

import Image from 'next/image';
import type { ReactNode } from 'react';

type ManualCrop = {
    left: number;
    top: number;
    width: number;
    height: number;
    aspectRatio: string;
    alt: string;
};

const SOURCE_IMAGE = '/docs/manuals/cambios-lluvia.png';

const CROPS = {
    speaker: {
        left: 0.74,
        top: 0.02,
        width: 0.22,
        height: 0.19,
        aspectRatio: '4 / 5',
        alt: 'Altavoz que debe guardarse dentro',
    },
    terrace: {
        left: 0.52,
        top: 0.22,
        width: 0.43,
        height: 0.21,
        aspectRatio: '8 / 5',
        alt: 'Terraza preparada para lluvia',
    },
    chairBad: {
        left: 0.06,
        top: 0.50,
        width: 0.42,
        height: 0.21,
        aspectRatio: '3 / 2',
        alt: 'Colocación incorrecta de una silla',
    },
    chairGood: {
        left: 0.51,
        top: 0.49,
        width: 0.43,
        height: 0.21,
        aspectRatio: '3 / 2',
        alt: 'Colocación correcta de una silla',
    },
    modules: {
        left: 0.52,
        top: 0.78,
        width: 0.43,
        height: 0.20,
        aspectRatio: '8 / 5',
        alt: 'Mesas montadas en módulos',
    },
} satisfies Record<string, ManualCrop>;

function ManualImageCrop({
    crop,
    className = '',
}: {
    crop: ManualCrop;
    className?: string;
}) {
    const backgroundX = crop.left / (1 - crop.width) * 100;
    const backgroundY = crop.top / (1 - crop.height) * 100;

    return (
        <div
            role="img"
            aria-label={crop.alt}
            className={`overflow-hidden rounded-xl bg-white bg-no-repeat ${className}`}
            style={{
                aspectRatio: crop.aspectRatio,
                backgroundImage: `url("${SOURCE_IMAGE}")`,
                backgroundSize: `${100 / crop.width}% ${100 / crop.height}%`,
                backgroundPosition: `${backgroundX}% ${backgroundY}%`,
            }}
        />
    );
}

function StepHeader({ number, title }: { number: number; title: string }) {
    return (
        <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ds-marca text-sm font-bold text-white">
                {number}
            </span>
            <h3 className="text-sm font-bold uppercase leading-tight tracking-wide text-zinc-800 sm:text-base">
                {title}
            </h3>
        </div>
    );
}

function StepCard({
    number,
    title,
    children,
}: {
    number: number;
    title: string;
    children: ReactNode;
}) {
    return (
        <section className="overflow-hidden rounded-2xl bg-white p-4 text-zinc-900 shadow-sm ring-1 ring-black/5 sm:p-5">
            <StepHeader number={number} title={title} />
            <div className="mt-4">{children}</div>
        </section>
    );
}

export function RainChangesManualContent() {
    return (
        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
            <div className="mx-auto max-w-5xl space-y-3">
                <StepCard number={1} title="Entrar basuras y altavoces">
                    <div className="flex justify-end">
                        <ManualImageCrop crop={CROPS.speaker} className="w-28 sm:w-36" />
                    </div>
                </StepCard>

                <StepCard number={2} title="Subir sillas, bancos y cerrar sombrillas">
                    <ManualImageCrop crop={CROPS.terrace} className="ml-auto w-full max-w-xl" />
                </StepCard>

                <StepCard number={3} title="Colocación correcta de las sillas">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                            <ManualImageCrop crop={CROPS.chairBad} className="w-full" />
                            <p className="mt-2 text-center text-xs font-bold uppercase text-red-600">
                                Incorrecto
                            </p>
                            <p className="mt-1 text-center text-xs leading-relaxed text-zinc-600">
                                Silla mal colocada. Si no se coloca bien, el viento la moverá y la dejará como estaba (o la tirará).
                            </p>
                        </div>
                        <div>
                            <ManualImageCrop crop={CROPS.chairGood} className="w-full" />
                            <p className="mt-2 text-center text-xs font-bold uppercase text-emerald-700">
                                Correcto
                            </p>
                            <p className="mt-1 text-center text-xs leading-relaxed text-zinc-600">
                                Silla girada y colgada para estabilidad contra el viento.
                            </p>
                        </div>
                    </div>
                </StepCard>

                <StepCard number={4} title="Montar mesas en módulos">
                    <ManualImageCrop crop={CROPS.modules} className="ml-auto w-full max-w-xl" />
                </StepCard>

                <StepCard number={5} title="Solo en caso de tormenta fuerte">
                    <p className="mb-4 text-sm font-medium text-zinc-600">
                        Además de los cuatro pasos anteriores, proteger también el cierre del bar:
                    </p>
                    <div className="grid gap-4 lg:grid-cols-2">
                        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50">
                            <Image
                                src="/docs/manuals/cambios-lluvia/storm-shutter-gap.webp"
                                alt="Rellenar el hueco bajo la persiana con una tabla, trapos y bayetas"
                                width={480}
                                height={247}
                                className="h-auto w-full"
                            />
                            <p className="p-3 text-sm leading-relaxed text-zinc-700">
                                Rellenar el hueco bajo la persiana con la tabla, trapos y bayetas hasta no dejar huecos visibles.
                            </p>
                        </div>
                        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50">
                            <Image
                                src="/docs/manuals/cambios-lluvia/storm-exterior-tarp.webp"
                                alt="Lona impermeable colocada por fuera con la reja bajada"
                                width={460}
                                height={376}
                                className="h-auto w-full"
                            />
                            <p className="p-3 text-sm leading-relaxed text-zinc-700">
                                Con la reja bajada, colocar la lona impermeable por fuera, atada por los ojales y cubriendo todo el hueco inferior.
                            </p>
                        </div>
                    </div>
                </StepCard>
            </div>
        </div>
    );
}
