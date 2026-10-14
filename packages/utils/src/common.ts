/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { clsx } from "clsx";
import type { ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";
import type { CompleteOrEmpty } from "@plane/types";

// Support email can be configured by the application
export const getSupportEmail = (defaultEmail: string = ""): string => defaultEmail;

// Custom typography classes: text-h1-semibold, text-body-md-regular, text-caption-xs-medium, etc. They set the size
// and line height, so they share the font-size group.
const isTypography = (value: string) =>
  /^(h[1-6]|body-(xs|sm|md)|caption-(xs|sm|md))-(regular|medium|semibold|bold)$/.test(value);

// The numeric sizes of propel and Pulse: text-9 to text-40, text-10-5, text-22, text-26
const isCustomFontSize = (value: string) => /^(9|10|10-5|11|12|13|14|16|18|20|22|24|26|28|32|40)$/.test(value);

const isNamedFontSize = (value: string) => /^(xs|sm|base|lg|xl|[2-9]xl)$/.test(value);

// text-[11.5px], text-[0.8rem], text-[length:var(--x)], text-(length:--x)
const isArbitraryFontSize = (value: string) =>
  /^\[(length:)?[\d.]+(px|rem|em)\]$/.test(value) || /^\[length:.+\]$/.test(value) || /^\(length:.+\)$/.test(value);

// Everything else after text- is a colour (text-primary, text-(--x), text-[#fff]) and lands in text-color. The font
// size group used to take only the numeric sizes and typography, so text-[11.5px] fell in with the colours and
// whichever of the two came last removed the other.
const twMerge = extendTailwindMerge({
  override: {
    classGroups: {
      "font-size": [
        {
          text: [
            (value: string) =>
              isCustomFontSize(value) || isNamedFontSize(value) || isArbitraryFontSize(value) || isTypography(value),
          ],
        },
      ],
    },
  },
});

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

/**
 * Extracts IDs from an array of objects with ID property
 */
export const extractIds = <T extends { id: string }>(items: T[]): string[] => items.map((item) => item.id);

/**
 * Checks if an ID exists and is valid within the provided list
 */
export const isValidId = (id: string | null | undefined, validIds: string[]): boolean => !!id && validIds.includes(id);

/**
 * Filters an array to only include valid IDs
 */
export const filterValidIds = (ids: string[], validIds: string[]): string[] =>
  ids.filter((id) => validIds.includes(id));

/**
 * Filters an array to include only valid IDs, returning both valid and invalid IDs
 */
export const partitionValidIds = (ids: string[], validIds: string[]): { valid: string[]; invalid: string[] } => {
  const valid: string[] = [];
  const invalid: string[] = [];

  ids.forEach((id) => {
    if (validIds.includes(id)) {
      valid.push(id);
    } else {
      invalid.push(id);
    }
  });

  return { valid, invalid };
};

/**
 * Checks if an object is complete (has properties) rather than empty.
 * This helps TypeScript narrow the type from CompleteOrEmpty<T> to T.
 *
 * @param obj The object to check, typed as CompleteOrEmpty<T>
 * @returns A boolean indicating if the object is complete (true) or empty (false)
 */
export const isComplete = <T>(obj: CompleteOrEmpty<T>): obj is T => {
  // Check if object is not null or undefined
  if (obj == null) return false;

  // Check if it's an object
  if (typeof obj !== "object") return false;

  // Check if it has any own properties
  return Object.keys(obj).length > 0;
};

export const convertRemToPixel = (rem: number): number => rem * 0.9 * 16;
