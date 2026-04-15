import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type AppPlaceholderProps = {
  title: string;
  description: string;
  ctaLabel?: string;
  ctaHref?: string;
};

export function AppPlaceholder({
  title,
  description,
  ctaHref,
  ctaLabel,
}: AppPlaceholderProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="text-sm leading-6 text-muted-foreground">
        This section now lives inside the shared application shell so we can grow
        the real workflows without reshaping navigation again.
      </CardContent>
      {ctaHref && ctaLabel ? (
        <CardFooter>
          <Button asChild variant="outline">
            <Link href={ctaHref}>{ctaLabel}</Link>
          </Button>
        </CardFooter>
      ) : null}
    </Card>
  );
}
