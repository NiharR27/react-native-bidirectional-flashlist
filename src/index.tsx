import React, { useCallback, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { ScrollViewProps, ViewProps } from 'react-native';
import { FlashList as ShopifyFlashList } from '@shopify/flash-list';
import type { FlashListProps } from '@shopify/flash-list';
import { debounce } from 'lodash';

export type Props<T> = Omit<
  FlashListProps<T>,
  'maintainVisibleContentPosition'
> & {
  onEndReached: () => Promise<void>;
  onStartReached: () => Promise<void>;
  enableAutoscrollToTop?: boolean;
  autoscrollToTopThreshold?: number;
  onStartReachedThreshold?: number;
  onEndReachedThreshold?: number;
  pageInfo: {
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  ref?:
    | ((instance: ShopifyFlashList<T> | null) => void)
    | MutableRefObject<ShopifyFlashList<T> | null>
    | null;
};

/**
 * Bidirectional FlashList Component
 * - Handles calling `onStartReached` and `onEndReached` for pagination.
 * - Supports auto-scrolling to the top for chat-like applications.
 */
export const FlashList = React.forwardRef(
  <T extends any>(
    props: Props<T>,
    ref:
      | ((instance: ShopifyFlashList<T> | null) => void)
      | MutableRefObject<ShopifyFlashList<T> | null>
      | null
  ) => {
    const {
      pageInfo = {
        hasNextPage: false,
        hasPreviousPage: false,
      },
      ...restProps
    } = props;

    const { hasNextPage, hasPreviousPage } = pageInfo;

    const {
      autoscrollToTopThreshold = 100,
      data,
      enableAutoscrollToTop,
      onEndReached = () => Promise.resolve(),
      onEndReachedThreshold = 10,
      onScroll,
      onStartReached = () => Promise.resolve(),
      onStartReachedThreshold = 10,
      onLayout,
      onContentSizeChange,
    } = restProps;

    const [contentHeight, setContentHeight] = useState(0);
    const [layoutHeight, setLayoutHeight] = useState(0);

    const onStartReachedTracker = useRef<Record<number, boolean>>({});
    const onEndReachedTracker = useRef<Record<number, boolean>>({});

    const onStartReachedInPromise = useRef<Promise<void> | null>(null);
    const onEndReachedInPromise = useRef<Promise<void> | null>(null);

    const createTrackerCall = (
      hasPage: boolean,
      tracker: MutableRefObject<Record<number, boolean>>,
      dataLength: number | undefined,
      handler: () => Promise<void>,
      inPromise: MutableRefObject<Promise<void> | null>
    ) => {
      if (!hasPage || !handler || !dataLength || tracker.current[dataLength]) return;

      tracker.current[dataLength] = true;
      
      const callHandler = () => {
        return new Promise<void>((resolve) => {
          inPromise.current = null;
          resolve();
        });
      };

      if (inPromise.current) {
        inPromise.current.finally(() => {
          inPromise.current = handler()?.then(callHandler);
        });
      } else {
        inPromise.current = handler()?.then(callHandler);
      }
    };

    const maybeCallOnStartReached = useCallback(() => {
      createTrackerCall(
        hasPreviousPage,
        onStartReachedTracker,
        data?.length,
        onStartReached,
        onStartReachedInPromise
      );
    }, [data?.length, onStartReached, hasPreviousPage]);

    const maybeCallOnEndReached = useCallback(() => {
      createTrackerCall(
        hasNextPage,
        onEndReachedTracker,
        data?.length,
        onEndReached,
        onEndReachedInPromise
      );
    }, [data?.length, onEndReached, hasNextPage]);

    const checkScrollPosition = useCallback(
      (offset: number, visibleLength: number, contentLength: number) => {
        const isScrollAtStart = offset < onStartReachedThreshold!;
        const isScrollAtEnd =
          contentLength - visibleLength - offset < onEndReachedThreshold!;

        if (isScrollAtStart) {
          maybeCallOnStartReached();
        }

        if (isScrollAtEnd) {
          maybeCallOnEndReached();
        }
      },
      [
        maybeCallOnEndReached,
        maybeCallOnStartReached,
        onEndReachedThreshold,
        onStartReachedThreshold,
      ]
    );

    const handleScroll: ScrollViewProps['onScroll'] = debounce((event) => {
      onScroll?.(event);

      const offset = event.nativeEvent.contentOffset.y;
      const visibleLength = event.nativeEvent.layoutMeasurement.height;
      const contentLength = event.nativeEvent.contentSize.height;

      checkScrollPosition(offset, visibleLength, contentLength);
    }, 100);

    const checkHeights = useCallback(
      (checkLayoutHeight: number, checkContentHeight: number) => {
        if (checkLayoutHeight >= checkContentHeight) {
          checkScrollPosition(0, checkLayoutHeight, checkContentHeight);
        }
      },
      [checkScrollPosition]
    );

    const realOnContentSizeChange = useCallback(
      (w: number, newContentHeight: number) => {
        if (onContentSizeChange) {
          onContentSizeChange(w, newContentHeight);
        }
        setContentHeight(newContentHeight);
        checkHeights(layoutHeight, newContentHeight);
      },
      [checkHeights, layoutHeight, onContentSizeChange]
    );

    const onLayoutSizeChange: ViewProps['onLayout'] = useCallback(
      (e) => {
        if (onLayout) {
          onLayout(e);
        }

        const {
          nativeEvent: {
            layout: { height },
          },
        } = e;
        setLayoutHeight(height);
        checkHeights(height, contentHeight);
      },
      [checkHeights, contentHeight, onLayout]
    );

    return (
      <>
        <ShopifyFlashList<T>
          {...restProps}
          ref={ref}
          progressViewOffset={50}
          onLayout={onLayoutSizeChange}
          onContentSizeChange={realOnContentSizeChange}
          onEndReached={null}
          onScroll={handleScroll}
          maintainVisibleContentPosition={
            enableAutoscrollToTop
              ? { autoscrollToTopThreshold, minIndexForVisible: 1 }
              : undefined
          }
        />
      </>
    );
  }
) as unknown as BidirectionalFlashListType;

type BidirectionalFlashListType = <T extends any>(
  props: Props<T>
) => React.ReactElement;
