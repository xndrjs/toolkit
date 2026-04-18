export interface AsyncDataInteractionPort<Data, Err = Error> {
  startLoading: () => void;
  endLoading: () => void;
  displayData: (data: Data) => void;
  displayError: (error: Err) => void;
}
