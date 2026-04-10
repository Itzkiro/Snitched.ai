import type { MetadataRoute } from 'next';
import { getServerSupabase } from '@/lib/supabase-server';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://snitched.ai';

  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
    { url: `${baseUrl}/browse`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
    { url: `${baseUrl}/officials`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
    { url: `${baseUrl}/candidates`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
    { url: `${baseUrl}/juicebox`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.8 },
    { url: `${baseUrl}/hierarchy`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.6 },
    { url: `${baseUrl}/social`, lastModified: new Date(), changeFrequency: 'hourly', priority: 0.5 },
    { url: `${baseUrl}/compare`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.7 },
    { url: `${baseUrl}/about`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
  ];

  try {
    const client = getServerSupabase();
    if (!client) return staticPages;

    const { data } = await client
      .from('politicians')
      .select('bioguide_id, updated_at')
      .eq('is_active', true)
      .order('name');

    if (!data) return staticPages;

    const politicianPages: MetadataRoute.Sitemap = data.map((row) => ({
      url: `${baseUrl}/politician/${row.bioguide_id}`,
      lastModified: row.updated_at ? new Date(row.updated_at as string) : new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    }));

    return [...staticPages, ...politicianPages];
  } catch {
    return staticPages;
  }
}
