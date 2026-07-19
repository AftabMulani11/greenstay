import * as React from "react"
import { cn } from "../utils/utils"
import { X, ChevronDown, Check } from "lucide-react"

/**
 * Reusable Button Component
 * Supports multiple variants (default, outline, ghost, danger, secondary) and sizes.
 */
const Button = React.forwardRef(({ className, variant = "default", size = "default", ...props }, ref) => {
  const variants = {
    default: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-glow shadow-primary/30 border border-transparent",
    outline: "border border-primary text-primary bg-transparent hover:bg-primary/5",
    ghost: "hover:bg-black/5 text-foreground/70 hover:text-foreground",
    danger: "bg-danger text-white hover:bg-danger/90",
    secondary: "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 shadow-sm",
  }
  const sizes = {
    default: "h-10 px-5 py-2",
    sm: "h-8 rounded-md px-3 text-xs",
    lg: "h-12 rounded-lg px-8 text-lg",
    icon: "h-10 w-10 p-2",
  }
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium font-sans transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50 active:scale-95",
        variants[variant], sizes[size], className
      )}
      {...props}
    />
  )
})
Button.displayName = "Button"

/**
 * Reusable Input Component
 * Standard styled input field with focus states.
 */
const Input = React.forwardRef(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        "flex h-11 w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-sans ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-transparent disabled:cursor-not-allowed disabled:opacity-50 transition-shadow",
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Input.displayName = "Input"

/**
 * Custom Select Component
 * A dropdown implementation that allows for custom rendering of options (e.g., flags).
 */
const Select = ({ value, onChange, options = [], placeholder = "Select...", className, disabled }) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const containerRef = React.useRef(null);

  // Close the dropdown if the user clicks outside the component
  React.useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedOption = options.find(opt => opt.value === value);

  return (
    <div className={cn("relative font-sans", className)} ref={containerRef}>
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={cn(
          "flex h-11 w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          isOpen && "ring-2 ring-primary border-transparent"
        )}
      >
        <span className={cn("truncate flex items-center gap-2", !selectedOption && "text-slate-400")}>
          {selectedOption ? (selectedOption.shortLabel || selectedOption.label) : placeholder}
        </span>
        <ChevronDown className={cn("h-4 w-4 opacity-50 transition-transform shrink-0", isOpen && "rotate-180")} />
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 max-h-60 w-max min-w-full max-w-[350px] overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-xl animate-in fade-in zoom-in-95 duration-100">
          {options.length === 0 ? (
            <div className="px-2 py-2 text-sm text-slate-500 text-center">No options</div>
          ) : (
            options.map((option) => (
              <div
                key={option.value}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={cn(
                  "relative flex cursor-pointer select-none items-center rounded-sm py-2 pl-3 pr-9 text-sm outline-none hover:bg-slate-50 data-[disabled]:pointer-events-none data-[disabled]:opacity-50 whitespace-nowrap",
                  option.value === value && "bg-primary/5 text-primary font-medium"
                )}
              >
                <span className="flex items-center gap-2 font-sans">
                  {option.label}
                </span>
                {option.value === value && (
                  <span className="absolute right-3 flex h-3.5 w-3.5 items-center justify-center">
                    <Check className="h-4 w-4" />
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

/**
 * Checkbox Component
 * Simple wrapper around native checkbox with custom styling hooks.
 */
const Checkbox = React.forwardRef(({ className, ...props }, ref) => (
  <input
    type="checkbox"
    ref={ref}
    className={cn(
      "h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 accent-primary",
      className
    )}
    {...props}
  />
));
Checkbox.displayName = "Checkbox";

/**
 * Label Component
 * Standard label for form inputs.
 */
const Label = React.forwardRef(({ className, ...props }, ref) => (
  <label
    ref={ref}
    className={cn("text-sm font-semibold leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-slate-700 mb-2 block font-sans", className)}
    {...props}
  />
))
Label.displayName = "Label"

/**
 * Badge Component
 * Used for status indicators (e.g., Active, Checked Out).
 */
const Badge = ({ className, variant = "default", ...props }) => {
  const variants = {
    default: "bg-primary/10 text-primary border-primary/20",
    success: "bg-emerald-100 text-emerald-700 border-emerald-200",
    warning: "bg-amber-100 text-amber-700 border-amber-200",
    outline: "text-foreground border-slate-200",
  }
  return (
    <div className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors font-sans", variants[variant], className)} {...props} />
  )
}

/**
 * Card Components
 * A set of components to build card-based layouts (Container, Header, Title, Content).
 */
const Card = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("rounded-xl border border-slate-100 bg-white/80 backdrop-blur-sm text-card-foreground shadow-soft animate-slide-up font-sans", className)} {...props} />
))
Card.displayName = "Card"

const CardHeader = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex flex-col space-y-1.5 p-6 border-b border-slate-50", className)} {...props} />
))
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef(({ className, children, ...props }, ref) => (
  <h3 ref={ref} className={cn("text-xl font-bold leading-none tracking-tight text-primary", className)} {...props}>
    {children}
  </h3>
))
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef(({ className, ...props }, ref) => (
  <p ref={ref} className={cn("text-sm text-slate-500 mt-1", className)} {...props} />
))
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-6", className)} {...props} />
))
CardContent.displayName = "CardContent"

/**
 * Table Components
 * A set of components to build data tables.
 */
const Table = React.forwardRef(({ className, ...props }, ref) => (
  <div className="relative w-full overflow-auto rounded-lg border border-slate-100 shadow-sm bg-white font-sans">
    <table ref={ref} className={cn("w-full caption-bottom text-sm", className)} {...props} />
  </div>
))
Table.displayName = "Table"

const TableHeader = React.forwardRef(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn("[&_tr]:border-b bg-slate-50/50", className)} {...props} />
))
TableHeader.displayName = "TableHeader"

const TableBody = React.forwardRef(({ className, ...props }, ref) => (
  <tbody ref={ref} className={cn("[&_tr:last-child]:border-0", className)} {...props} />
))
TableBody.displayName = "TableBody"

const TableRow = React.forwardRef(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn("border-b border-slate-100 transition-colors hover:bg-primary/5 data-[state=selected]:bg-muted cursor-pointer", className)}
    {...props}
  />
))
TableRow.displayName = "TableRow"

const TableHead = React.forwardRef(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn("h-12 px-4 text-left align-middle font-semibold text-slate-500 [&:has([role=checkbox])]:pr-0", className)}
    {...props}
  />
))
TableHead.displayName = "TableHead"

const TableCell = React.forwardRef(({ className, ...props }, ref) => (
  <td ref={ref} className={cn("p-4 align-middle [&:has([role=checkbox])]:pr-0 text-slate-700", className)} {...props} />
))
TableCell.displayName = "TableCell"

/**
 * Modal Component
 * A basic overlay modal with a title and close button.
 */
const Modal = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in font-sans">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6 animate-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-primary">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors"><X className="w-5 h-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
};

export { 
  Button, Input, Select, Checkbox, Label, Badge,
  Card, CardHeader, CardTitle, CardDescription, CardContent,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
  Modal
}