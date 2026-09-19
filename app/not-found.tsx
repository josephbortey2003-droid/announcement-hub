import Link from "next/link";
import { SearchX } from "lucide-react";
import type { Metadata } from "next";

export const metadata:Metadata={title:"Page not found"};

export default function NotFound(){return <main className="not-found"><span><SearchX size={28}/></span><p className="eyebrow">404</p><h1>Page not found</h1><p>The address may be incorrect or the page may have moved.</p><Link href="/" className="primary-action">Return to Announcement Hub</Link></main>}
