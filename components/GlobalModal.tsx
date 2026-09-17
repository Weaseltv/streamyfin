import { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useCallback, useEffect } from "react";
import { useWindowDimensions } from "react-native";
import {
  NeonSheetBackdrop,
  neonSheetBackgroundStyle,
  neonSheetHandleIndicatorStyle,
  neonSheetHandleStyle,
} from "@/components/common/NeonSheet";
import { SHEET_MAX_HEIGHT_RATIO } from "@/constants/Values";
import { useGlobalModal } from "@/providers/GlobalModalProvider";

/**
 * GlobalModal Component
 *
 * This component renders a global bottom sheet modal that can be controlled
 * from anywhere in the app using the useGlobalModal hook.
 *
 * Place this component at the root level of your app (in _layout.tsx)
 * after BottomSheetModalProvider.
 */
export const GlobalModal = () => {
  const { hideModal, modalState, modalRef, isVisible } = useGlobalModal();
  // Derived here rather than passed in by callers: this component re-renders on
  // rotation, so a sheet that is already open follows the new window height.
  const { height: windowHeight } = useWindowDimensions();
  const maxDynamicContentSize = windowHeight * SHEET_MAX_HEIGHT_RATIO;

  useEffect(() => {
    if (isVisible && modalState.content) {
      modalRef.current?.present();
    }
  }, [isVisible, modalState.content, modalRef]);

  const handleSheetChanges = useCallback(
    (index: number) => {
      if (index === -1) {
        hideModal();
      }
    },
    [hideModal],
  );

  // The P14 panel: `card` fill with a 1pt `line2` top border, radius 0, no
  // grabber (the sheet head carries the close glyph), flat `stage` scrim.
  const defaultOptions = {
    enableDynamicSizing: true,
    enablePanDownToClose: true,
    backgroundStyle: neonSheetBackgroundStyle,
    handleIndicatorStyle: neonSheetHandleIndicatorStyle,
  };

  // Merge default options with provided options
  const modalOptions = { ...defaultOptions, ...modalState.options };

  return (
    <BottomSheetModal
      ref={modalRef}
      {...(modalOptions.snapPoints
        ? // Dynamic sizing is on by default and would add a content-height
          // detent next to the requested snap points, so turn it off for
          // callers that ask for fixed heights.
          { snapPoints: modalOptions.snapPoints, enableDynamicSizing: false }
        : {
            enableDynamicSizing: modalOptions.enableDynamicSizing,
            maxDynamicContentSize,
          })}
      onChange={handleSheetChanges}
      backdropComponent={NeonSheetBackdrop}
      handleIndicatorStyle={modalOptions.handleIndicatorStyle}
      handleStyle={neonSheetHandleStyle}
      backgroundStyle={modalOptions.backgroundStyle}
      enablePanDownToClose={modalOptions.enablePanDownToClose}
      enableDismissOnClose
      // Left at gorhom's defaults on purpose. `adjustResize` only means
      // something when the window actually resizes for the keyboard, and this
      // app draws edge to edge, so it never does — setting it drove the sheet
      // down behind the keyboard instead. Sheets with inputs scroll their own
      // content out of the way (see CustomHeaderSheet).
      keyboardBlurBehavior='restore'
      stackBehavior='push'
      style={{ zIndex: 1000 }}
    >
      {modalState.content}
    </BottomSheetModal>
  );
};
