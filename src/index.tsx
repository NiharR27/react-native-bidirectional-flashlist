import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  forwardRef,
} from 'react';
import type { MutableRefObject } from 'react';
import type { ScrollViewProps, ViewProps } from 'react-native';
import { FlashList as ShopifyFlashList } from '@shopify/flash-list';
import type { FlashListProps } from '@shopify/flash-list';
import debounce from 'lodash/debounce';

export type Props<T> = Omit<FlashListProps<T>, 'maintainVisibleContentPosition'> & {
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
};

type BidirectionalFlashListType = <T>(
  props: Props<T> & { ref?: React.Ref<ShopifyFlashList<T>> }
) => React.ReactElement;

const BidirectionalFlashList = forwardRef(<T,>(
  props: Props<T>,
  ref: React.Ref<ShopifyFlashList<T>>
) => {
  const {
    pageInfo: { hasNextPage, hasPreviousPage },
    autoscrollToTopThreshold = 100,
    data,
    enableAutoscrollToTop,
    onEndReached,
    onEndReachedThreshold = 10,
    onScroll,
    onStartReached,
    onStartReachedThreshold = 10,
    onLayout,
    onContentSizeChange,
    ...restProps
  } = props;

  const [contentHeight, setContentHeight] = useState(0);
  const [layoutHeight, setLayoutHeight] = useState(0);

  const onStartReachedTracker = useRef<Record<number, boolean>>({});
  const onEndReachedTracker = useRef<Record<number, boolean>>({});

  const onStartReachedInPromise = useRef<Promise<void> | null>(null);
  const onEndReachedInPromise = useRef<Promise<void> | null>(null);

  /**
   * Handles tracking and execution of pagination events (e.g., onStartReached, onEndReached).
   * Ensures that the handler is called only once per data length and manages concurrent calls.
   * 
   * @param hasPage - Indicates if there are more pages to load (next or previous).
   * @param tracker - A ref object to track whether the handler has been called for a specific data length.
   * @param dataLength - The current length of the data array.
   * @param handler - The function to execute when the pagination event is triggered.
   * @param inPromise - A ref object to manage the state of the ongoing handler promise.
   */
  const createTrackerCall = useCallback(
    (
      hasPage: boolean,
      tracker: MutableRefObject<Record<number, boolean>>,
      dataLength: number | undefined,
      handler: () => Promise<void>,
      inPromise: MutableRefObject<Promise<void> | null>
    ) => {
      if (!hasPage || dataLength == null || tracker.current[dataLength]) {
        return;
      }
      tracker.current[dataLength] = true;

      const callHandler = () => {
        inPromise.current = null;
      };

      const call = async () => {
        try {
          await handler();
        } catch (error) {
          console.error("Error in handler:", error);
        } finally {
          callHandler();
        }
      };

      if (inPromise.current) {
        inPromise.current.finally(() => {
          inPromise.current = call();
        });
      } else {
        inPromise.current = call();
      }
    },
    []
  );

  const maybeCallOnStartReached = useCallback(() => {
    createTrackerCall(
      hasPreviousPage,
      onStartReachedTracker,
      data?.length,
      onStartReached,
      onStartReachedInPromise
    );
  }, [data?.length, hasPreviousPage, onStartReached, createTrackerCall]);

  const maybeCallOnEndReached = useCallback(() => {
    createTrackerCall(
      hasNextPage,
      onEndReachedTracker,
      data?.length,
      onEndReached,
      onEndReachedInPromise
    );
  }, [data?.length, hasNextPage, onEndReached, createTrackerCall]);

  const checkScrollPosition = useCallback(
    (offset: number, visibleLength: number, contentLength: number) => {
      if (offset < onStartReachedThreshold) {
        maybeCallOnStartReached();
      }
      if (contentLength - visibleLength - offset < onEndReachedThreshold) {
        maybeCallOnEndReached();
      }
    },
    [maybeCallOnStartReached, maybeCallOnEndReached, onStartReachedThreshold, onEndReachedThreshold]
  );

  const handleScroll = useMemo(
    () =>
      debounce((event: NativeSyntheticEvent<NativeScrollEvent>) => {
        onScroll?.(event);
        const {
          contentOffset: { y: offset },
          layoutMeasurement: { height: visibleLength },
          contentSize: { height: contentLength },
        } = event.nativeEvent;
        checkScrollPosition(offset, visibleLength, contentLength);
      }, 100),
    [onScroll, checkScrollPosition]
  );

  useEffect(() => {
    return () => {
      handleScroll.cancel();
    };
  }, [handleScroll]);

  const checkHeights = useCallback(
    (layoutH: number, contentH: number) => {
      if (layoutH >= contentH) {
        checkScrollPosition(0, layoutH, contentH);
      }
    },
    [checkScrollPosition]
  );

  const realOnContentSizeChange = useCallback(
    (w: number, newContentHeight: number) => {
      onContentSizeChange?.(w, newContentHeight);
      setContentHeight(newContentHeight);
      checkHeights(layoutHeight, newContentHeight);
    },
    [onContentSizeChange, layoutHeight, checkHeights]
  );

  const onLayoutSizeChange: ViewProps['onLayout'] = useCallback(
    (e) => {
      onLayout?.(e);
      setLayoutHeight(e.nativeEvent.layout.height);
      checkHeights(e.nativeEvent.layout.height, contentHeight);
    },
    [onLayout, contentHeight, checkHeights]
  );

  return (
    <ShopifyFlashList<T>
      {...restProps}
      ref={ref}
      progressViewOffset={50}
      onLayout={onLayoutSizeChange}
      onContentSizeChange={realOnContentSizeChange}
      onScroll={handleScroll}
      maintainVisibleContentPosition={
        enableAutoscrollToTop
          ? { autoscrollToTopThreshold, minIndexForVisible: 1 }
          : undefined
      }
    />
  );
}) as unknown as BidirectionalFlashListType;

export default BidirectionalFlashList;
