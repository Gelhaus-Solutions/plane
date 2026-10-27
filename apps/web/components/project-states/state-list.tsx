/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import type { IState, TStateOperationsCallbacks } from "@plane/types";
// components
import { StateItem } from "@/components/project-states";

type TStateList = {
  /** The workspace state group the states sit in (E30). */
  groupKey: string;
  /** The group is the built-in Review: its states draw the review icon. */
  review?: boolean;
  groupedStates: Record<string, IState[]>;
  states: IState[];
  stateOperationsCallbacks: TStateOperationsCallbacks;
  disabled?: boolean;
  stateItemClassName?: string;
};

export const StateList = observer(function StateList(props: TStateList) {
  const {
    groupKey,
    review,
    groupedStates,
    states,
    stateOperationsCallbacks,
    disabled = false,
    stateItemClassName,
  } = props;

  return (
    <>
      {states.map((state: IState) => (
        <StateItem
          key={state?.name}
          groupKey={groupKey}
          review={review}
          groupedStates={groupedStates}
          totalStates={states.length || 0}
          state={state}
          disabled={disabled}
          stateOperationsCallbacks={stateOperationsCallbacks}
          stateItemClassName={stateItemClassName}
        />
      ))}
    </>
  );
});
