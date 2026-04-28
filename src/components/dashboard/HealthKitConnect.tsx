import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function AppleHealthIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" rx="6" fill="#FF3B30" />
      <path
        d="M12 18.5C12 18.5 5 13.5 5 9.5C5 7.567 6.567 6 8.5 6C9.668 6 10.703 6.591 11.333 7.5L12 8.5L12.667 7.5C13.297 6.591 14.332 6 15.5 6C17.433 6 19 7.567 19 9.5C19 13.5 12 18.5 12 18.5Z"
        fill="white"
      />
    </svg>
  );
}

export default function HealthKitConnect() {
  return (
    <Card className="opacity-60">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <AppleHealthIcon size={22} />
          Apple Health
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Apple Health integration coming soon.
        </p>
      </CardContent>
    </Card>
  );
}
