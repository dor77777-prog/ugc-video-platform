import { redirect } from 'next/navigation';

// Legacy /edit URL — keep redirecting old links into the new wizard layout.
export default async function ProjectEditRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/projects/${id}/scripts`);
}
