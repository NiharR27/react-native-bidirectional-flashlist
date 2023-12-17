import React, { useCallback, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { ScrollViewProps, ViewProps } from 'react-native';
import { FlashList as ShopifyFlashList } from '@shopify/flash-list';
import type { FlashListProps } from '@shopify/flash-list';

export type Props<T> = Omit<
  FlashListProps<T>,
  'maintainVisibleContentPosition'
> & {
  /**
   * Called once when the scroll position gets close to end of list. This must return a promise.
   * You can `onEndReachedThreshold` as distance from end of list, when this function should be called.
   */
  onEndReached: () => Promise<void>;
  /**
   * Called once when the scroll position gets close to begining of list. This must return a promise.
   * You can `onStartReachedThreshold` as distance from beginning of list, when this function should be called.
   */
  onStartReached: () => Promise<void>;
  /**
   * Enable autoScrollToTop.
   * In chat type applications, you want to auto scroll to bottom, when new message comes it.
   */
  enableAutoscrollToTop?: boolean;
  /**
   * If `enableAutoscrollToTop` is true, the scroll threshold below which auto scrolling should occur.
   */
  autoscrollToTopThreshold?: number;
  /** Scroll distance from beginning of list, when onStartReached should be called. */
  onStartReachedThreshold?: number;
  /**
   * Scroll distance from end of list, when onStartReached should be called.
   * Please note that this is different from onEndReachedThreshold of FlatList from react-native.
   */
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
 * Note:
 * - `onEndReached` and `onStartReached` must return a promise.
 * - `onEndReached` and `onStartReached` only get called once, per content length.
 * - maintainVisibleContentPosition is fixed, and can't be modified through props.
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
      onEndReached = () => Promise.resolve() as any,
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

    const maybeCallOnStartReached = useCallback(() => {
      if (!hasPreviousPage || typeof onStartReached !== 'function') return;

      // If onStartReached has already been called for given data length, then ignore.
      if (data?.length && onStartReachedTracker.current[data.length]) return;

      if (data?.length) onStartReachedTracker.current[data.length] = true;

      const p = () => {
        return new Promise<void>((resolve) => {
          onStartReachedInPromise.current = null;
          resolve();
        });
      };

      if (onEndReachedInPromise.current) {
        onEndReachedInPromise.current.finally(() => {
          onStartReachedInPromise.current = onStartReached()?.then(p);
        });
      } else {
        onStartReachedInPromise.current = onStartReached()?.then(p);
      }
    }, [data?.length, onStartReached, hasPreviousPage]);

    const maybeCallOnEndReached = useCallback(() => {
      if (!hasNextPage || typeof onEndReached !== 'function') return;

      // If onEndReached has already been called for given data length, then ignore.
      if (data?.length && onEndReachedTracker.current[data.length]) return;

      if (data?.length) onEndReachedTracker.current[data.length] = true;

      const p = () => {
        return new Promise<void>((resolve) => {
          onStartReachedInPromise.current = null;
          resolve();
        });
      };

      if (onStartReachedInPromise.current) {
        onStartReachedInPromise.current.finally(() => {
          onEndReachedInPromise.current = onEndReached()?.then(p);
        });
      } else {
        onEndReachedInPromise.current = onEndReached()?.then(p);
      }
    }, [data?.length, onEndReached, hasNextPage]);

    const checkScrollPosition = useCallback(
      (offset: number, visibleLength: number, contentLength: number) => {
        const isScrollAtStart = offset < onStartReachedThreshold;
        const isScrollAtEnd =
          contentLength - visibleLength - offset < onEndReachedThreshold;

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

    const handleScroll: ScrollViewProps['onScroll'] = (event) => {
      // Call the parent onScroll handler, if provided.
      onScroll?.(event);

      const offset = event.nativeEvent.contentOffset.y;
      const visibleLength = event.nativeEvent.layoutMeasurement.height;
      const contentLength = event.nativeEvent.contentSize.height;

      checkScrollPosition(offset, visibleLength, contentLength);
    };

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
          maintainVisibleContentPosition={{
            autoscrollToTopThreshold: enableAutoscrollToTop
              ? autoscrollToTopThreshold
              : undefined,
            minIndexForVisible: 1,
          }}
        />
      </>
    );
  }
) as unknown as BidirectionalFlashListType;

type BidirectionalFlashListType = <T extends any>(
  props: Props<T>
) => React.ReactElement;
