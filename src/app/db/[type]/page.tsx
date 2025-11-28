import { ArcadesMap } from "@/components/db/arcades";
import { TYPES } from "@/app/db/layout";

type DbTypePageProps = {
  params: Promise<{
    type: string;
  }>;
};

export default async function DbTypePage({ params }: DbTypePageProps) {
  const {type} = await params;

  return (
    <>
      {type === "arcades" && (
        <div className="mt-4">
          <ArcadesMap />
        </div>
      )}

      {type === "home" && (
        <div className="mt-8">
          <div className="bg-muted/50 rounded-lg p-8 text-center">
            <p className="text-muted-foreground">
              Welcome to the database section. Select a category above to
              explore.
            </p>
          </div>
        </div>
      )}

      {/* Songs is handled by /db/songs route */}
      {!["home", "arcades", "songs"].includes(type) && (
        <div className="mt-8">
          <div className="bg-muted/50 rounded-lg p-8 text-center">
            <p className="text-muted-foreground">
              Content for database type &quot;{type}&quot; coming soon...
            </p>
          </div>
        </div>
      )}
    </>
  );
}

export async function generateStaticParams(): Promise<{ type: string }[]> {
  return TYPES.map((type) => ({ type }));
}

