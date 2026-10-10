"use client";

import { memo } from "react";
import { Button } from "@tomomai/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@tomomai/ui/select-friendly";
import { X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Generic filter type - value is always string for simplicity
export interface GenericFilter {
  type: string;
  value: string;
}

// Filter category configuration
export interface FilterCategory {
  type: string;
  label: string;
  icon: LucideIcon;
  options: Array<{ value: string; label: string }>;
  limit_one?: boolean;
}

// Props for getting label for a filter (custom per use-case)
export type GetFilterLabelFn = (filter: GenericFilter) => string;

// Props for applying filters to data (custom per use-case)
export type ApplyFiltersFn<T> = (filters: GenericFilter[]) => T[];

export function getFilterKey(filter: GenericFilter): string {
  return `${filter.type}-${filter.value}`;
}

interface FilterPanelProps<T> {
  filters: GenericFilter[];
  onAddFilter: (filter: GenericFilter) => void;
  onRemoveFilter: (filter: GenericFilter) => void;
  categories: FilterCategory[];
  applyFilters: ApplyFiltersFn<T>;
  getFilterLabel: GetFilterLabelFn;
  className?: string;
  triggerClassName?: string;
  /** Skip entrance animations on first mount (set by the parent list). */
  disableInitialAnimation?: boolean;
}

function FilterPanelInner<T>({
  filters,
  onAddFilter,
  onRemoveFilter,
  categories,
  applyFilters,
  getFilterLabel,
  className,
  triggerClassName,
  disableInitialAnimation,
}: FilterPanelProps<T>) {
  const wouldYieldResults = (testFilter: GenericFilter): boolean => {
    // First check if the filter alone yields any results (remove useless filters)
    const aloneResults = applyFilters([testFilter]).length > 0;
    if (!aloneResults) return false;

    // Then check if it yields results with existing filters
    const testFilters = [...filters, testFilter];
    return applyFilters(testFilters).length > 0;
  };

  const getAvailableOptions = (category: FilterCategory) => {
    const activeFilters = filters.filter(f => f.type === category.type).map(f => f.value);

    // Get options not already selected
    const availableOptions = category.options.filter(opt => !activeFilters.includes(opt.value));

    // Filter to only show options that would yield results
    return availableOptions.filter(opt =>
      wouldYieldResults({ type: category.type, value: opt.value })
    );
  };

  const handleSelectValue = (categoryType: string, value: string) => {
    onAddFilter({ type: categoryType, value });
  };

  return (
    <motion.div
      initial={disableInitialAnimation ? false : { height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{
        height: { duration: 0.3, ease: [0.4, 0, 0.2, 1] },
        opacity: { duration: 0.25, ease: "easeInOut" }
      }}
    >
      <motion.div
        className={cn("space-y-3", className)}
        initial={disableInitialAnimation ? false : { y: -10 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      >
        <div className="flex flex-wrap gap-2 items-center">
          {/* Active Filters */}
          <AnimatePresence mode="popLayout">
            {filters.map((filter, index) => (
              <motion.div
                key={getFilterKey(filter)}
                initial={disableInitialAnimation ? false : { width: 0, opacity: 0 }}
                animate={{ width: "auto", opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{
                  duration: 0.2,
                  ease: [0.4, 0, 0.2, 1],
                  delay: index * 0.03
                }}
                layout
              >
                <Button
                  variant="default"
                  size="sm"
                  className="gap-2 whitespace-nowrap"
                  onClick={() => onRemoveFilter(filter)}
                >
                  {getFilterLabel(filter)}
                  <X className="h-3 w-3" />
                </Button>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Add Filter Dropdowns */}
          <AnimatePresence mode="popLayout">
            {categories.map((category, index) => {
              const options = getAvailableOptions(category);
              if (options.length === 0) return null;

              const Icon = category.icon;

              return (
                <motion.div
                  key={category.type}
                  initial={disableInitialAnimation ? false : { width: 0, opacity: 0 }}
                  animate={{ width: "auto", opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={{
                    duration: 0.25,
                    ease: [0.4, 0, 0.2, 1],
                    delay: 0.1 + (index * 0.05)
                  }}
                  layout
                >
                  <Select
                    value=""
                    onValueChange={(value) => handleSelectValue(category.type, value)}
                  >
                    <SelectTrigger className={cn("w-auto h-8 min-w-[100px] whitespace-nowrap gap-1", triggerClassName)}>
                      <Icon className="h-4 w-4" />
                      <SelectValue placeholder={category.label} />
                    </SelectTrigger>
                    <SelectContent>
                      {options.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}

export const FilterPanel = memo(FilterPanelInner) as typeof FilterPanelInner;
