import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  // No theme toggle exists in the app and it is dark-only (see App.tsx's
  // ThemeProvider comment). Hardcoded rather than read from next-themes'
  // useTheme(), which is still forced to "light" — deliberately NOT changed
  // to forcedTheme="dark" globally, since that would add a `dark` class to
  // <html> and activate 50+ untouched components' leftover `dark:` variants
  // from a prior, different dark theme. This is the narrow, contained fix.
  const theme = "dark";

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
