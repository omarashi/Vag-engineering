import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { twMerge } from "tailwind-merge";

const buttonVariants = cva("button", {
  variants: { variant: { primary: "primary", secondary: "secondary", ghost: "ghost" } },
  defaultVariants: { variant: "secondary" },
});

type ButtonProps = React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean };

export function Button({ className, variant, asChild = false, ...props }: ButtonProps) {
  const Element = asChild ? Slot : "button";
  return <Element data-slot="button" className={twMerge(buttonVariants({ variant }), className)} {...props} />;
}

